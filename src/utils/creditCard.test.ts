import { describe, it, expect } from 'vitest';
import { getStatementPeriods, getCardStatement, sumCardPayments } from './creditCard';
import { ActivityLog, Expense } from '../types';

const expense = (id: string, date: string, amount: number, accountId = 'card'): Expense => ({
  id,
  amount,
  currency: 'COP',
  description: id,
  category: 'Other',
  date,
  accountId,
});

describe('getStatementPeriods', () => {
  it('closes the statement on the cutoff day itself', () => {
    // Aug 15 with a day-15 cutoff: the statement just closed, so it still owns
    // the 15th and the new cycle starts on the 16th.
    const p = getStatementPeriods(15, new Date(2026, 7, 15));
    expect(p.lastCutoff).toBe('2026-08-15');
    expect(p.billedStart).toBe('2026-07-16');
    expect(p.currentStart).toBe('2026-08-16');
  });

  it('uses last month\'s cutoff before the cutoff day', () => {
    const p = getStatementPeriods(15, new Date(2026, 7, 10));
    expect(p.lastCutoff).toBe('2026-07-15');
    expect(p.billedStart).toBe('2026-06-16');
    expect(p.currentStart).toBe('2026-07-16');
  });

  it('rolls back across the new year', () => {
    const p = getStatementPeriods(15, new Date(2026, 0, 3));
    expect(p.lastCutoff).toBe('2025-12-15');
    expect(p.billedStart).toBe('2025-11-16');
    expect(p.currentStart).toBe('2025-12-16');
  });

  it('clamps out-of-range or missing cutoff days to 1-28', () => {
    // Day 31 clamps to 28, and on Aug 20 that cutoff hasn't come round yet.
    expect(getStatementPeriods(31, new Date(2026, 7, 20)).lastCutoff).toBe('2026-07-28');
    expect(getStatementPeriods(0, new Date(2026, 7, 20)).lastCutoff).toBe('2026-08-15');
  });
});

describe('getCardStatement', () => {
  const today = new Date(2026, 7, 20); // Aug 20 -> billed Jul 16..Aug 15, current from Aug 16

  it('splits purchases on the cutoff boundary', () => {
    const expenses = [
      expense('before', '2026-07-15', 100),  // previous statement, excluded
      expense('first', '2026-07-16', 200),   // first day billed
      expense('last', '2026-08-15', 300),    // cutoff day, still billed
      expense('next', '2026-08-16', 400),    // first day of the running cycle
    ];

    const s = getCardStatement(expenses, 'card', 15, today);
    expect(s.billed.map(e => e.id)).toEqual(['first', 'last']);
    expect(s.current.map(e => e.id)).toEqual(['next']);
  });

  it('ignores purchases charged to other accounts', () => {
    const expenses = [
      expense('mine', '2026-08-01', 100),
      expense('theirs', '2026-08-01', 100, 'checking'),
    ];

    const s = getCardStatement(expenses, 'card', 15, today);
    expect(s.billed.map(e => e.id)).toEqual(['mine']);
  });
});

describe('sumCardPayments', () => {
  const log = (over: Partial<ActivityLog>): ActivityLog => ({
    id: '1',
    date: '2026-08-18T10:00:00.000Z',
    description: 'Card payment',
    amount: 100,
    currency: 'COP',
    destinationAccountId: 'card',
    type: 'cardPayment',
    ...over,
  });

  it('adds payments to this card from the given date onwards', () => {
    const logs = [
      log({ id: 'a', amount: 100 }),
      log({ id: 'b', amount: 50, sourceAccountId: undefined }), // paid by someone else, still counts
      log({ id: 'c', amount: 999, date: '2026-08-01T10:00:00.000Z' }), // before the window
      log({ id: 'd', amount: 999, destinationAccountId: 'other-card' }),
      log({ id: 'e', amount: 999, type: 'manual' }), // a plain transfer, not a payment
    ];

    expect(sumCardPayments(logs, 'card', '2026-08-16', 'COP')).toBe(150);
  });

  it('returns 0 when there are no logs at all', () => {
    expect(sumCardPayments(undefined, 'card', '2026-08-16', 'COP')).toBe(0);
  });
});
