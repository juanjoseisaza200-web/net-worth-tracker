import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppData, Automation, RecurringIncome } from '../types';
import { processAutomations, initialLastRunMonth } from './automations';

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

  it('does not re-deposit a recurring income already run this month', () => {
    const data = twoAccounts();
    data.recurringIncomes = [{
      id: 'r1', amount: 200, currency: 'USD', description: 'Salary', category: 'Salary',
      dayOfMonth: 1, isActive: true, accountId: 'd', lastRunMonth: '2026-01',
    }];

    const { newData, messages } = processAutomations(data);

    expect(messages).toHaveLength(0);
    expect(newData.accounts.find(a => a.id === 'd')!.balance).toBe(0);
    expect(newData.incomes).toHaveLength(0);
  });

  it('is a no-op when there are no automations or recurring incomes', () => {
    const data = twoAccounts();
    const { newData, messages } = processAutomations(data);
    expect(messages).toHaveLength(0);
    expect(newData).toBe(data);
  });
});

describe('initialLastRunMonth', () => {
  afterEach(() => vi.useRealTimers());

  it("skips this month when the day already passed, so it doesn't deposit on creation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28)); // Sep 28
    expect(initialLastRunMonth(15)).toBe('2026-09');
  });

  it('still pays this month when the day has not come yet', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 10)); // Sep 10
    expect(initialLastRunMonth(15)).toBe('2026-08');
  });

  it('handles January', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 3));
    expect(initialLastRunMonth(15)).toBe('2025-12');
  });

  it('a new recurring income created after its day does not deposit when processed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28));
    const data = twoAccounts();
    data.recurringIncomes = [{
      id: 'r', amount: 100, currency: 'USD', description: 'Salary', category: 'Salary',
      dayOfMonth: 15, isActive: true, accountId: data.accounts[0].id, lastRunMonth: initialLastRunMonth(15),
    }];
    const { messages } = processAutomations(data);
    expect(messages).toEqual([]);
  });
});
