import { AppData } from '../types';

const toDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDateKey = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const daysBetween = (fromKey: string, toKey: string): number =>
  Math.round((parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / 86_400_000);

/**
 * Accrue daily compound interest into standalone fixed-income entries based on
 * their effective annual rate (`interestRate`, e.g. 9.3 for 9.3% EA):
 *
 *   newAmount = amount * (1 + rate/100)^(daysElapsed / 365)
 *
 * Idempotent per day via `lastAccruedDate` (won't double-count within a day, and
 * catches up correctly after several days offline). Skips entries that are linked
 * to a cash account (their value mirrors that account) or have no positive rate,
 * and never accrues past `maturityDate`. Returns the SAME reference when nothing
 * changes, so callers can cheaply detect "did anything change".
 *
 * Meant to run as a side effect of loading data (like processAutomations), so the
 * stored balance grows over time as the app is opened.
 */
export function accrueFixedIncome(data: AppData): AppData {
  if (!data.fixedIncome || data.fixedIncome.length === 0) return data;

  const todayKey = toDateKey(new Date());
  let modified = false;

  const updated = data.fixedIncome.map(fi => {
    if (fi.linkedAccountId || !fi.interestRate || fi.interestRate <= 0) return fi;

    // First time we see it: start the clock today; don't back-accrue history we don't have.
    if (!fi.lastAccruedDate) {
      modified = true;
      return { ...fi, lastAccruedDate: todayKey };
    }

    // Accrue up to today, but never beyond maturity.
    const endKey = fi.maturityDate && fi.maturityDate < todayKey ? fi.maturityDate : todayKey;
    const days = daysBetween(fi.lastAccruedDate, endKey);
    if (days <= 0) return fi;

    const factor = Math.pow(1 + fi.interestRate / 100, days / 365);
    modified = true;
    return { ...fi, amount: fi.amount * factor, lastAccruedDate: endKey };
  });

  return modified ? { ...data, fixedIncome: updated } : data;
}
