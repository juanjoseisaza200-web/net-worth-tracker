import { ActivityLog, Currency, Expense } from '../types';
import { convertCurrency } from './currency';

/**
 * Credit-card statement maths.
 *
 * A card is a regular `Account` of type `credit` whose `balance` is the debt as
 * a negative number, so net worth, transfers and expenses all work on it
 * unchanged. What lives here is the bit that isn't shared: slicing purchases
 * into the statement that already closed versus the cycle still running.
 *
 * Dates are compared as raw YYYY-MM-DD strings — zero-padded ISO dates sort
 * chronologically as text, which sidesteps the timezone traps described in
 * `date.ts`.
 */

const pad = (n: number) => String(n).padStart(2, '0');

const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Fallback when a card has no `statementDay` stored yet. */
export const DEFAULT_STATEMENT_DAY = 15;

export interface StatementPeriods {
  /** Most recent cutoff; the closed statement includes this day. */
  lastCutoff: string;
  /** First day covered by the closed statement. */
  billedStart: string;
  /** First day of the cycle still accumulating. */
  currentStart: string;
}

/**
 * Locate the cycle boundaries around `today`. The cutoff day itself belongs to
 * the statement that closes on it, so on the 15th with `statementDay` 15 the
 * statement has just closed and the new cycle starts on the 16th.
 */
export const getStatementPeriods = (statementDay: number, today: Date): StatementPeriods => {
  const day = Math.min(Math.max(Math.trunc(statementDay) || DEFAULT_STATEMENT_DAY, 1), 28);

  const cutoff = today.getDate() >= day
    ? new Date(today.getFullYear(), today.getMonth(), day)
    : new Date(today.getFullYear(), today.getMonth() - 1, day);

  // Build the neighbouring days via the Date(y, m, d) constructor so month and
  // year rollover is handled for us.
  const prevCutoff = new Date(cutoff.getFullYear(), cutoff.getMonth() - 1, day);
  const billedStart = new Date(prevCutoff.getFullYear(), prevCutoff.getMonth(), prevCutoff.getDate() + 1);
  const currentStart = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate() + 1);

  return {
    lastCutoff: toKey(cutoff),
    billedStart: toKey(billedStart),
    currentStart: toKey(currentStart),
  };
};

export interface CardStatement extends StatementPeriods {
  /** Purchases on the statement that closed on `lastCutoff`. */
  billed: Expense[];
  /** Purchases since the cutoff — these go on the next statement. */
  current: Expense[];
}

/**
 * Split one card's purchases into the closed statement and the running cycle.
 * Purchases older than `billedStart` belong to earlier statements and are left
 * out of both lists; they're still part of the account balance.
 */
export const getCardStatement = (
  expenses: Expense[],
  cardId: string,
  statementDay: number,
  today: Date
): CardStatement => {
  const periods = getStatementPeriods(statementDay, today);
  const mine = expenses.filter(e => e.accountId === cardId);

  return {
    ...periods,
    billed: mine.filter(e => e.date >= periods.billedStart && e.date <= periods.lastCutoff),
    current: mine.filter(e => e.date >= periods.currentStart),
  };
};

/** Total a set of purchases in `target`, skipping any value that can't convert. */
export const sumInCurrency = (expenses: Expense[], target: Currency): number =>
  expenses.reduce((sum, e) => {
    const value = convertCurrency(e.amount, e.currency, target);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);

/**
 * Payments applied to a card on or after `fromDate` (YYYY-MM-DD), totalled in
 * `target`. `ActivityLog.date` is a full ISO timestamp, hence the slice.
 */
export const sumCardPayments = (
  logs: ActivityLog[] | undefined,
  cardId: string,
  fromDate: string,
  target: Currency
): number =>
  (logs || [])
    .filter(l => l.type === 'cardPayment' && l.destinationAccountId === cardId && l.date.slice(0, 10) >= fromDate)
    .reduce((sum, l) => {
      const value = convertCurrency(l.amount, l.currency, target);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
