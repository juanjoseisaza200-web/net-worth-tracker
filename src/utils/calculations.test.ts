import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppData } from '../types';
import {
  calculateNetWorth,
  calculateTotalExpenses,
  calculateTotalIncome,
  recordNetWorthSnapshot,
  calculateCategoryBreakdown,
} from './calculations';
import { Expense } from '../types';

const baseData = (): AppData => ({
  accounts: [{ id: 'a', name: 'Checking', balance: 1000, currency: 'USD', type: 'checking' }],
  expenses: [],
  incomes: [],
  recurringIncomes: [],
  stocks: [{ id: 's', symbol: 'AAA', shares: 10, purchasePrice: 5, currentPrice: 7, currency: 'USD' }],
  crypto: [{ id: 'c', symbol: 'BTC', amount: 2, purchasePrice: 100, currentPrice: 150, currency: 'USD' }],
  fixedIncome: [{ id: 'f', name: 'Bond', amount: 500, interestRate: 3, currency: 'USD' }],
  variableInvestments: [{ id: 'v', name: 'Art', amount: 200, currentValue: 250, currency: 'USD', type: 'other' }],
  baseCurrency: 'USD',
});

describe('calculateNetWorth', () => {
  it('sums cash + investments using current price when available', () => {
    // 1000 cash + 10*7 stock + 2*150 crypto + 500 fixed + 250 variable = 2120
    expect(calculateNetWorth(baseData(), 'USD')).toBe(2120);
  });

  it('excludes fixed income that is linked to a cash account (avoids double counting)', () => {
    const data = baseData();
    data.fixedIncome[0].linkedAccountId = 'a';
    // 2120 - 500 linked fixed = 1620
    expect(calculateNetWorth(data, 'USD')).toBe(1620);
  });

  it('falls back to purchase price when no current price is set', () => {
    const data = baseData();
    delete data.stocks[0].currentPrice; // 10 * 5 = 50 instead of 70
    expect(calculateNetWorth(data, 'USD')).toBe(2120 - 70 + 50);
  });
});

describe('recordNetWorthSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10)); // 2026-03-10 local
  });
  afterEach(() => vi.useRealTimers());

  it('appends one snapshot for today', () => {
    const out = recordNetWorthSnapshot(baseData());
    expect(out.netWorthHistory).toHaveLength(1);
    expect(out.netWorthHistory![0]).toEqual({ date: '2026-03-10', value: 2120, currency: 'USD' });
  });

  it('dedupes per day, overwriting the same day with the latest value', () => {
    let out = recordNetWorthSnapshot(baseData());
    const changed = { ...out, accounts: [{ ...out.accounts[0], balance: 2000 }] };
    out = recordNetWorthSnapshot(changed);
    expect(out.netWorthHistory).toHaveLength(1);
    expect(out.netWorthHistory![0].value).toBe(3120); // +1000 cash
  });
});

describe('calculateCategoryBreakdown', () => {
  const exp = (over: Partial<Expense>): Expense => ({
    id: Math.random().toString(), amount: 0, currency: 'USD', description: '',
    category: 'Other', date: '2026-03-01', accountId: 'a', ...over,
  });

  it('sums by category, sorts descending, and computes percentages', () => {
    const out = calculateCategoryBreakdown([
      exp({ amount: 100, category: 'Food' }),
      exp({ amount: 50, category: 'Food' }),
      exp({ amount: 300, category: 'Bills' }),
    ], 'USD');

    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ category: 'Bills', value: 300, percentage: (300 / 450) * 100 });
    expect(out[1].category).toBe('Food');
    expect(out[1].value).toBe(150);
    expect(out.reduce((s, e) => s + e.percentage, 0)).toBeCloseTo(100, 6);
  });

  it('returns an empty array when there are no expenses', () => {
    expect(calculateCategoryBreakdown([], 'USD')).toEqual([]);
  });
});

describe('period filters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10)); // March 2026
  });
  afterEach(() => vi.useRealTimers());

  it('counts only the current month for month period', () => {
    const data = baseData();
    data.expenses = [
      { id: 'e1', amount: 100, currency: 'USD', description: '', category: '', date: '2026-03-05', accountId: 'a' },
      { id: 'e2', amount: 50, currency: 'USD', description: '', category: '', date: '2026-02-20', accountId: 'a' },
    ];
    expect(calculateTotalExpenses(data, 'USD', 'month')).toBe(100);
    expect(calculateTotalExpenses(data, 'USD', 'year')).toBe(150);
    expect(calculateTotalExpenses(data, 'USD')).toBe(150);
  });

  it('sums income for the current month', () => {
    const data = baseData();
    data.incomes = [
      { id: 'i1', amount: 300, currency: 'USD', description: '', category: '', date: '2026-03-01', accountId: 'a' },
    ];
    expect(calculateTotalIncome(data, 'USD', 'month')).toBe(300);
  });
});
