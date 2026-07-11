import { AppData, ActivityLog, Income } from '../types';
import { convertCurrency } from './currency';

export function processAutomations(data: AppData): { newData: AppData; messages: string[] } {
  const hasAutomations = data.automations && data.automations.length > 0;
  const hasRecurringIncomes = data.recurringIncomes && data.recurringIncomes.length > 0;

  if (!hasAutomations && !hasRecurringIncomes) {
    return { newData: data, messages: [] };
  }

  const newData = {
    ...data,
    accounts: [...(data.accounts || [])],
    incomes: [...(data.incomes || [])]
  };
  const messages: string[] = [];
  const updatedAutomations = data.automations ? [...data.automations] : [];
  const updatedRecurringIncomes = data.recurringIncomes ? [...data.recurringIncomes] : [];
  const newActivityLogs: ActivityLog[] = [...(data.activityLogs || [])];
  let isModified = false;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  const getMonthStr = (y: number, m: number) => {
    let adjustedY = y;
    let adjustedM = m;
    if (adjustedM < 0) {
      adjustedM += 12;
      adjustedY -= 1;
    }
    return `${adjustedY}-${String(adjustedM + 1).padStart(2, '0')}`;
  };

  const currentMonthStr = getMonthStr(year, month);
  const previousMonthStr = getMonthStr(year, month - 1);

  for (let i = 0; i < updatedAutomations.length; i++) {
    const automation = updatedAutomations[i];
    if (!automation.isActive) continue;

    let runForMonth = '';
    let shouldRun = false;

    if (automation.dayOfMonth === 0) {
      const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
      if (date === lastDayOfMonth) {
        if (automation.lastRunMonth !== currentMonthStr) {
          shouldRun = true;
          runForMonth = currentMonthStr;
        }
      } else {
        if (!automation.lastRunMonth) {
          updatedAutomations[i] = { ...automation, lastRunMonth: previousMonthStr };
          isModified = true;
        } else if (automation.lastRunMonth < previousMonthStr) {
          shouldRun = true;
          runForMonth = previousMonthStr;
        }
      }
    } else {
      if (date >= automation.dayOfMonth) {
        if (automation.lastRunMonth !== currentMonthStr && (!automation.lastRunMonth || automation.lastRunMonth < currentMonthStr)) {
          shouldRun = true;
          runForMonth = currentMonthStr;
        }
      } else {
        if (!automation.lastRunMonth) {
          updatedAutomations[i] = { ...automation, lastRunMonth: previousMonthStr };
          isModified = true;
        } else if (automation.lastRunMonth < previousMonthStr) {
          shouldRun = true;
          runForMonth = previousMonthStr;
        }
      }
    }

    if (shouldRun) {
      const sourceAccIndex = newData.accounts.findIndex(a => a.id === automation.sourceAccountId);
      const destAccIndex = newData.accounts.findIndex(a => a.id === automation.destinationAccountId);

      if (sourceAccIndex !== -1 && destAccIndex !== -1) {
        const sourceAcc = newData.accounts[sourceAccIndex];
        const destAcc = newData.accounts[destAccIndex];

        let transferAmount = 0;

        if (automation.type === 'transfer' && automation.amount) {
          transferAmount = automation.amount;
        } else if (automation.type === 'sweep') {
          const keep = automation.keepAmount || 0;
          if (sourceAcc.balance > keep) {
            transferAmount = sourceAcc.balance - keep;
          }
        }

        if (transferAmount > 0) {
          // Deduct from source
          newData.accounts[sourceAccIndex] = {
            ...newData.accounts[sourceAccIndex],
            balance: newData.accounts[sourceAccIndex].balance - transferAmount
          };
          
          // Add to dest (convert currency if needed)
          const convertedAmount = convertCurrency(transferAmount, sourceAcc.currency, destAcc.currency);
          newData.accounts[destAccIndex] = {
            ...newData.accounts[destAccIndex],
            balance: newData.accounts[destAccIndex].balance + convertedAmount
          };

          messages.push(`Ran "${automation.name}": Transferred ${transferAmount} ${sourceAcc.currency} to ${destAcc.name}.`);
          
          newActivityLogs.push({
            id: Date.now().toString() + Math.random().toString(36).substring(7),
            date: now.toISOString(),
            description: `Automated: ${automation.name}`,
            amount: transferAmount,
            currency: sourceAcc.currency,
            sourceAccountId: sourceAcc.id,
            destinationAccountId: destAcc.id,
            type: 'automation'
          });
          
          isModified = true;
        }

        // Always update lastRunMonth so it doesn't try again if balance was insufficient
        updatedAutomations[i] = { ...automation, lastRunMonth: runForMonth };
        isModified = true;
      }
    }
  }

  // --- Process Recurring Incomes ---
  for (let i = 0; i < updatedRecurringIncomes.length; i++) {
    const recurring = updatedRecurringIncomes[i];
    if (!recurring.isActive || !recurring.accountId) continue;

    let runForMonth = '';
    let shouldRun = false;

    if (date >= recurring.dayOfMonth) {
      if (recurring.lastRunMonth !== currentMonthStr && (!recurring.lastRunMonth || recurring.lastRunMonth < currentMonthStr)) {
        shouldRun = true;
        runForMonth = currentMonthStr;
      }
    } else {
      if (!recurring.lastRunMonth) {
        updatedRecurringIncomes[i] = { ...recurring, lastRunMonth: previousMonthStr };
        isModified = true;
      } else if (recurring.lastRunMonth < previousMonthStr) {
        shouldRun = true;
        runForMonth = previousMonthStr;
      }
    }

    if (shouldRun) {
      const targetAccIndex = newData.accounts.findIndex(a => a.id === recurring.accountId);
      
      if (targetAccIndex !== -1) {
        const targetAcc = newData.accounts[targetAccIndex];
        
        // Add money to the account (handling currency conversion if the account is in a different currency)
        const convertedAmount = convertCurrency(recurring.amount, recurring.currency, targetAcc.currency);
        newData.accounts[targetAccIndex] = {
          ...targetAcc,
          balance: targetAcc.balance + convertedAmount
        };

        // Create a physical income record for the historical logs
        const newIncome: Income = {
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          amount: recurring.amount,
          currency: recurring.currency,
          description: recurring.description,
          category: recurring.category,
          // Local YYYY-MM-DD (not UTC) so it lands in the correct month for the
          // income totals, which parse local dates. lastRunMonth is local too.
          date: `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`,
          accountId: targetAcc.id
        };
        newData.incomes.push(newIncome);

        messages.push(`Received Salary/Income: ${recurring.amount} ${recurring.currency} deposited to ${targetAcc.name}.`);
        
        newActivityLogs.push({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          date: now.toISOString(),
          description: `Automated Income: ${recurring.description}`,
          amount: recurring.amount,
          currency: recurring.currency,
          destinationAccountId: targetAcc.id,
          type: 'automation'
        });

        updatedRecurringIncomes[i] = { ...recurring, lastRunMonth: runForMonth };
        isModified = true;
      }
    }
  }

  if (isModified) {
    newData.automations = updatedAutomations;
    newData.recurringIncomes = updatedRecurringIncomes;
    newData.activityLogs = newActivityLogs;
    return { newData, messages };
  }

  return { newData: data, messages: [] };
}
