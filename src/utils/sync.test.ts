import { describe, it, expect } from 'vitest';
import { classifySnapshot, applyPrices, resolveEditedBalance } from './sync';
import { AppData } from '../types';

describe('classifySnapshot', () => {
  it('waits when the cache says the document does not exist', () => {
    // A new device, cleared storage or iOS eviction: the cache simply has
    // nothing. Treating that as a brand-new user would show empty data and let
    // the next save wipe the real document.
    expect(classifySnapshot({ exists: false, fromCache: true })).toBe('wait');
  });

  it('treats a missing document confirmed by the server as a new user', () => {
    expect(classifySnapshot({ exists: false, fromCache: false })).toBe('server');
  });

  it('shows cached data but does not treat it as synced', () => {
    expect(classifySnapshot({ exists: true, fromCache: true })).toBe('cached');
  });

  it('treats server data as synced', () => {
    expect(classifySnapshot({ exists: true, fromCache: false })).toBe('server');
  });
});

const base = (): AppData => ({
  accounts: [],
  expenses: [],
  incomes: [],
  recurringIncomes: [],
  stocks: [
    { id: 's1', symbol: 'AAPL', shares: 1, purchasePrice: 100, currentPrice: 150, currency: 'USD' },
  ],
  crypto: [
    { id: 'c1', symbol: 'BTC', amount: 1, purchasePrice: 10, currentPrice: 20, currency: 'USD' },
  ],
  fixedIncome: [],
  variableInvestments: [],
  baseCurrency: 'COP',
});

describe('applyPrices', () => {
  it('updates prices on the data it is given', () => {
    const next = applyPrices(base(), { AAPL: 160 }, { BTC: 25 });
    expect(next.stocks[0].currentPrice).toBe(160);
    expect(next.crypto[0].currentPrice).toBe(25);
  });

  it('keeps changes made while prices were being fetched', () => {
    // Prices were requested for base(); meanwhile an expense was booked and a
    // stock added. Applying the prices must not revert either change.
    const latest: AppData = {
      ...base(),
      expenses: [{ id: 'e1', amount: 5, currency: 'COP', description: 'x', category: 'Food', date: '2026-09-28', accountId: 'a' }],
      stocks: [...base().stocks, { id: 's2', symbol: 'MSFT', shares: 2, purchasePrice: 300, currency: 'USD' }],
    };
    const next = applyPrices(latest, { AAPL: 160, MSFT: 400 }, {});
    expect(next.expenses).toHaveLength(1);
    expect(next.stocks.map(s => [s.symbol, s.currentPrice])).toEqual([['AAPL', 160], ['MSFT', 400]]);
  });

  it('returns the same object when no price changed', () => {
    const data = base();
    expect(applyPrices(data, { AAPL: 150 }, { BTC: 20 })).toBe(data);
    expect(applyPrices(data, {}, {})).toBe(data);
  });
});

describe('resolveEditedBalance', () => {
  it('keeps the current balance when the field was not touched', () => {
    // The form opened at 100 owed; a 50 purchase was booked in the background.
    // Saving a rename must not write the stale -100 back.
    expect(resolveEditedBalance({ current: -150, typed: '100', typedAtOpen: '100', isCredit: true })).toBe(-150);
  });

  it('keeps a card balance in favour when the field was not touched', () => {
    expect(resolveEditedBalance({ current: 50, typed: '50', typedAtOpen: '50', isCredit: true })).toBe(50);
  });

  it('uses the typed value when the field was edited', () => {
    expect(resolveEditedBalance({ current: -150, typed: '200', typedAtOpen: '100', isCredit: true })).toBe(-200);
    expect(resolveEditedBalance({ current: 1000, typed: '1200.5', typedAtOpen: '1000', isCredit: false })).toBe(1200.5);
  });
});
