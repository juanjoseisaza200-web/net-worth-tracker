import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppData, Automation, RecurringIncome } from '../types';
import { processAutomations } from './automations';

const twoAccounts = (): AppData => ({
  accounts: [
    { id: 's', name: 'Source', balance: 500, currency: 'USD', type: 'checking' },
    { id: 'd', name: 'Dest', balance: 0, currency: 'USD', type: 'savings' },
  ],
  expenses: [],
  incomes: [],
  recurringIncomes: [],
  stocks: [],
  crypto: [],
  fixedIncome: [],
  variableInvestments: [],
  baseCurrency: 'USD',
});

const automation = (over: Partial<Automation>): Automation => ({
  id: 'a1',
  name: 'Rule',
  type: 'transfer',
  sourceAccountId: 's',
  destinationAccountId: 'd',
  dayOfMonth: 15,
  isActive: true,
  ...over,
});

describe('processAutomations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 20)); // 2026-01-20, past day-of-month 15
  });
  afterEach(() => vi.useRealTimers());

  it('runs a due transfer and records it', () => {
    const data = twoAccounts();
    data.automations = [automation({ type: 'transfer', amount: 100 })];

    const { newData, messages } = processAutomations(data);

    expect(newData.accounts.find(a => a.id === 's')!.balance).toBe(400);
    expect(newData.accounts.find(a => a.id === 'd')!.balance).toBe(100);
    expect(messages).toHaveLength(1);
    expect(newData.automations![0].lastRunMonth).toBe('2026-01');
    expect(newData.activityLogs).toHaveLength(1);
  });

  it('runs a sweep leaving keepAmount behind', () => {
    const data = twoAccounts();
    data.automations = [automation({ type: 'sweep', keepAmount: 100 })];

    const { newData } = processAutomations(data);

    expect(newData.accounts.find(a => a.id === 's')!.balance).toBe(100);
    expect(newData.accounts.find(a => a.id === 'd')!.balance).toBe(400);
  });

  it('does not re-run when already run this month', () => {
    const data = twoAccounts();
    data.automations = [automation({ type: 'transfer', amount: 100, lastRunMonth: '2026-01' })];

    const { newData, messages } = processAutomations(data);

    expect(messages).toHaveLength(0);
    expect(newData.accounts.find(a => a.id === 's')!.balance).toBe(500);
  });

  it('deposits a due recurring income and logs a matching income record', () => {
    const data = twoAccounts();
    const recurring: RecurringIncome = {
      id: 'r1',
      amount: 200,
      currency: 'USD',
      description: 'Salary',
      category: 'Salary',
      dayOfMonth: 1,
      isActive: true,
      accountId: 'd',
    };
    data.recurringIncomes = [recurring];

    const { newData, messages } = processAutomations(data);

    expect(newData.accounts.find(a => a.id === 'd')!.balance).toBe(200);
    expect(newData.incomes).toHaveLength(1);
    expect(newData.incomes[0].amount).toBe(200);
    expect(messages).toHaveLength(1);
    expect(newData.recurringIncomes[0].lastRunMonth).toBe('2026-01');
  });

  it('is a no-op when there are no automations or recurring incomes', () => {
    const data = twoAccounts();
    const { newData, messages } = processAutomations(data);
    expect(messages).toHaveLength(0);
    expect(newData).toBe(data);
  });
});
