import { AppData, Account } from '../types';
import { convertCurrency } from './currency';

export function processAutomations(data: AppData): { newData: AppData; messages: string[] } {
  if (!data.automations || data.automations.length === 0) {
    return { newData: data, messages: [] };
  }

  let newData = { ...data, accounts: [...(data.accounts || [])] };
  let messages: string[] = [];
  let updatedAutomations = [...data.automations];
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
        if (!automation.lastRunMonth || automation.lastRunMonth < previousMonthStr) {
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
        if (!automation.lastRunMonth || automation.lastRunMonth < previousMonthStr) {
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
          isModified = true;
        }

        // Always update lastRunMonth so it doesn't try again if balance was insufficient
        updatedAutomations[i] = { ...automation, lastRunMonth: runForMonth };
        isModified = true;
      }
    }
  }

  if (isModified) {
    newData.automations = updatedAutomations;
    return { newData, messages };
  }

  return { newData: data, messages: [] };
}
