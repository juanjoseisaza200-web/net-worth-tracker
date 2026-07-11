import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppData, FixedIncome } from '../types';
import { accrueFixedIncome } from './fixedIncome';

const withFixed = (fixed: FixedIncome[]): AppData => ({
  accounts: [], expenses: [], incomes: [], recurringIncomes: [],
  stocks: [], crypto: [], fixedIncome: fixed, variableInvestments: [],
  baseCurrency: 'USD',
});

const fi = (over: Partial<FixedIncome>): FixedIncome => ({
  id: '1', name: 'Nu', amount: 1000, interestRate: 10, currency: 'USD', ...over,
});

describe('accrueFixedIncome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10)); // 2026-03-10 local
  });
  afterEach(() => vi.useRealTimers());

  it('initializes lastAccruedDate on first sight without changing the amount', () => {
    const out = accrueFixedIncome(withFixed([fi({ lastAccruedDate: undefined })]));
    expect(out.fixedIncome[0].lastAccruedDate).toBe('2026-03-10');
    expect(out.fixedIncome[0].amount).toBe(1000);
  });

  it('accrues one full year to the effective annual rate', () => {
    // 2025-03-10 -> 2026-03-10 = 365 days, 10% EA => *1.10
    const out = accrueFixedIncome(withFixed([fi({ amount: 1000, interestRate: 10, lastAccruedDate: '2025-03-10' })]));
    expect(out.fixedIncome[0].amount).toBeCloseTo(1100, 4);
    expect(out.fixedIncome[0].lastAccruedDate).toBe('2026-03-10');
  });

  it('accrues a partial period (compound daily)', () => {
    const out = accrueFixedIncome(withFixed([fi({ amount: 1000, interestRate: 9.3, lastAccruedDate: '2026-03-01' })]));
    const expected = 1000 * Math.pow(1.093, 9 / 365); // 9 days
    expect(out.fixedIncome[0].amount).toBeCloseTo(expected, 6);
  });

  it('does nothing (same reference) when already accrued today', () => {
    const data = withFixed([fi({ lastAccruedDate: '2026-03-10' })]);
    expect(accrueFixedIncome(data)).toBe(data);
  });

  it('skips linked entries and zero-rate entries', () => {
    const data = withFixed([
      fi({ id: 'a', linkedAccountId: 'acc1', amount: 5000, lastAccruedDate: '2025-01-01' }),
      fi({ id: 'b', interestRate: 0, amount: 5000, lastAccruedDate: '2025-01-01' }),
    ]);
    expect(accrueFixedIncome(data)).toBe(data);
  });

  it('stops accruing at maturity', () => {
    // matured 2026-02-01; should only accrue 2026-01-01 -> 2026-02-01 (31 days)
    const out = accrueFixedIncome(withFixed([
      fi({ amount: 1000, interestRate: 12, lastAccruedDate: '2026-01-01', maturityDate: '2026-02-01' }),
    ]));
    const expected = 1000 * Math.pow(1.12, 31 / 365);
    expect(out.fixedIncome[0].amount).toBeCloseTo(expected, 6);
    expect(out.fixedIncome[0].lastAccruedDate).toBe('2026-02-01');
    // running again is a no-op (already at maturity)
    expect(accrueFixedIncome(out)).toBe(out);
  });
});
