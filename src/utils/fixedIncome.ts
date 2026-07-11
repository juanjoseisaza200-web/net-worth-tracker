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
 * Accrue daily compound interest on fixed-income entries based on their
 * effective annual rate (`interestRate`, e.g. 9.3 for 9.3% EA):
 *
 *   grownValue = value * (1 + rate/100)^(daysElapsed / 365)
 *
 * Where the interest lands depends on the entry:
 *  - **Linked** to a cash account: grows that account's `balance` (the entry's
 *    own `amount` is 0 and just mirrors the account).
 *  - **Standalone**: grows the entry's own `amount`.
 *
 * Idempotent per day via `lastAccruedDate` (won't double-count within a day, and
 * catches up correctly after several days offline). Skips entries with no
 * positive rate, and never accrues past `maturityDate`. Returns the SAME
 * reference when nothing changes, so callers can cheaply detect "did anything
 * change". Meant to run as a side effect of loading data (like processAutomations).
 */
export function accrueFixedIncome(data: AppData): AppData {
  if (!data.fixedIncome || data.fixedIncome.length === 0) return data;

  const todayKey = toDateKey(new Date());
  let modified = false;
  const accounts = data.accounts ? [...data.accounts] : [];

  const updatedFixed = data.fixedIncome.map(fi => {
    if (!fi.interestRate || fi.interestRate <= 0) return fi;

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

    if (fi.linkedAccountId) {
      // Grow the linked cash account's balance (the entry's own amount is 0).
      const idx = accounts.findIndex(a => a.id === fi.linkedAccountId);
      if (idx === -1) return fi; // orphaned link: nothing to grow, retry later
      accounts[idx] = { ...accounts[idx], balance: accounts[idx].balance * factor };
      modified = true;
      return { ...fi, lastAccruedDate: endKey };
    }

    // Standalone: grow the entry's own amount.
    modified = true;
    return { ...fi, amount: fi.amount * factor, lastAccruedDate: endKey };
  });

  return modified ? { ...data, accounts, fixedIncome: updatedFixed } : data;
}
