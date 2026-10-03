import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppData } from '../types';
import {
  calculateNetWorth,
  calculateTotalExpenses,
  calculateTotalIncome,
  recordNetWorthSnapshot,
  calculateCategoryBreakdown,
  calculateCurrencyExposure,
  roundAccountBalances,
  groupStocksByBroker,
  assignBroker,
  sortHoldings,
  HoldingSortKey,
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

describe('calculateCurrencyExposure', () => {
  it('adds up to 100% even with credit-card debt', () => {
    // Before: shares were divided by net worth (which subtracts the card), so
    // COP + USD came to more than 100%.
    const data = baseData();
    data.accounts.push({ id: 'cop', name: 'Ahorros', balance: 4166666.67, currency: 'COP', type: 'savings' });
    data.accounts.push({ id: 'card', name: 'Visa', balance: -2000000, currency: 'COP', type: 'credit' });
    const exposure = calculateCurrencyExposure(data, 'COP');
    const total = exposure.reduce((sum, e) => sum + e.percentage, 0);
    expect(total).toBeCloseTo(100, 6);
    expect(exposure.every(e => e.percentage >= 0 && e.percentage <= 100)).toBe(true);
  });
});

describe('roundAccountBalances', () => {
  it('rounds balances to cents', () => {
    const data = baseData();
    data.accounts[0].balance = 14054342.661916541;
    expect(roundAccountBalances(data).accounts[0].balance).toBe(14054342.66);
  });

  it('returns the same object when every balance is already in cents', () => {
    const data = baseData();
    data.accounts[0].balance = 1577772.5;
    expect(roundAccountBalances(data)).toBe(data);
  });
});

describe('groupStocksByBroker', () => {
  const stock = (id: string, broker: string | undefined, shares: number, buy: number, now?: number) =>
    ({ id, symbol: id, shares, purchasePrice: buy, currentPrice: now, currency: 'USD' as const, ...(broker !== undefined ? { broker } : {}) });

  it('totals value, invested and gain per broker, largest first', () => {
    const groups = groupStocksByBroker([
      stock('A', 'Hapi', 10, 5, 7),   // 70 now, 50 invested
      stock('B', 'IBKR', 1, 100, 90), // 90 now, 100 invested
      stock('C', 'Hapi', 2, 10),      // no current price: 20 now, 20 invested
    ], 'USD');
    expect(groups.map(g => g.broker)).toEqual(['Hapi', 'IBKR']);
    expect(groups[0]).toMatchObject({ value: 90, invested: 70, gain: 20, count: 2 });
    expect(groups[1]).toMatchObject({ value: 90 - 0, invested: 100, gain: -10, count: 1 });
  });

  it('treats a missing or blank broker as one unassigned group and matches names ignoring case/spaces', () => {
    const groups = groupStocksByBroker([
      stock('A', undefined, 1, 10),
      stock('B', '  ', 1, 10),
      stock('C', 'hapi ', 1, 30),
      stock('D', 'Hapi', 1, 30),
    ], 'USD');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ broker: 'hapi', value: 60, count: 2 });
    expect(groups[1]).toMatchObject({ broker: '', value: 20, count: 2 });
  });

  it('converts each holding to the target currency', () => {
    const groups = groupStocksByBroker([{ ...stock('A', 'Hapi', 1, 10), currency: 'COP' }], 'COP');
    expect(groups[0].value).toBe(10);
  });
});

describe('assignBroker', () => {
  const stocks = [
    { id: 'a', symbol: 'A', shares: 1, purchasePrice: 1, currency: 'USD' as const, broker: 'Old' },
    { id: 'b', symbol: 'B', shares: 1, purchasePrice: 1, currency: 'USD' as const },
    { id: 'c', symbol: 'C', shares: 1, purchasePrice: 1, currency: 'USD' as const, broker: 'Keep' },
  ];

  it('sets the trimmed broker on the selected stocks only', () => {
    const out = assignBroker(stocks, new Set(['a', 'b']), '  Hapi ');
    expect(out.map(s => s.broker)).toEqual(['Hapi', 'Hapi', 'Keep']);
  });

  it('clears the broker (no empty field left behind) when the name is blank', () => {
    const out = assignBroker(stocks, new Set(['a']), '   ');
    expect('broker' in out[0]).toBe(false);
    expect(out[2].broker).toBe('Keep');
  });
});

describe('sortHoldings', () => {
  // value / P&L $ / P&L %:  A 70 / +20 / +40%   B 90 / -10 / -10%   C 30 / +20 / +200%
  const holdings = [
    { id: 'A', symbol: 'MSFT', units: 10, purchasePrice: 5, currentPrice: 7, currency: 'USD' as const },
    { id: 'B', symbol: 'aapl', units: 1, purchasePrice: 100, currentPrice: 90, currency: 'USD' as const },
    { id: 'C', symbol: 'NVDA', units: 3, purchasePrice: 3.3333333333, currentPrice: 10, currency: 'USD' as const },
  ];
  const ids = (key: HoldingSortKey, dir: 'desc' | 'asc') => sortHoldings(holdings, h => h.units, key, dir, 'USD').map(h => h.id);

  it('sorts by value', () => {
    expect(ids('value', 'desc')).toEqual(['B', 'A', 'C']);
    expect(ids('value', 'asc')).toEqual(['C', 'A', 'B']);
  });

  it('sorts by P&L amount and by P&L percent', () => {
    expect(ids('pnl', 'asc')[0]).toBe('B');
    expect(ids('pnlPercent', 'desc')).toEqual(['C', 'A', 'B']);
  });

  it('sorts by name ignoring case, A-Z when ascending', () => {
    expect(ids('name', 'asc')).toEqual(['B', 'A', 'C']);
    expect(ids('name', 'desc')).toEqual(['C', 'A', 'B']);
  });

  it('compares value across currencies in the target currency', () => {
    const mixed = [
      { id: 'cop', symbol: 'X', units: 1, purchasePrice: 100000, currency: 'COP' as const }, // ~25 USD
      { id: 'usd', symbol: 'Y', units: 1, purchasePrice: 50, currency: 'USD' as const },
    ];
    expect(sortHoldings(mixed, h => h.units, 'value', 'desc', 'USD').map(h => h.id)).toEqual(['usd', 'cop']);
  });

  it('does not mutate the input', () => {
    const copy = [...holdings];
    ids('value', 'asc');
    expect(holdings).toEqual(copy);
  });
});
