import { AppData } from '../types';
import { parseAmount } from './number';

/**
 * Guards against the whole-document model's main hazard: writing an old copy
 * of AppData over a newer one. Everything here is pure so it can be tested.
 */

/**
 * How App should treat a Firestore snapshot of users/{uid}.
 * - 'wait': the local cache has no document. That says nothing about the
 *   server (new device, cleared storage, iOS eviction), so it must not be
 *   read as "brand-new user" — showing empty data would let the next save
 *   wipe the real document.
 * - 'cached': possibly stale local data. Show it, but don't run automations
 *   or accrual on it and don't unlock cloud saves.
 * - 'server': confirmed by the server (a missing document here really is a
 *   new user).
 */
export type SnapshotKind = 'wait' | 'cached' | 'server';

export const classifySnapshot = ({ exists, fromCache }: { exists: boolean; fromCache: boolean }): SnapshotKind => {
  if (fromCache) return exists ? 'cached' : 'wait';
  return 'server';
};

/**
 * Apply fetched prices to the LATEST data. Price requests take seconds; if
 * the result were written onto the copy taken when the request started, any
 * expense, capture or holding saved meanwhile would be reverted.
 * Returns the same object when nothing changed.
 */
export const applyPrices = (
  data: AppData,
  stockPrices: Record<string, number>,
  cryptoPrices: Record<string, number>,
): AppData => {
  let changed = false;
  const stocks = data.stocks.map(s => {
    const p = stockPrices[s.symbol];
    if (!p || p === s.currentPrice) return s;
    changed = true;
    return { ...s, currentPrice: p };
  });
  const crypto = data.crypto.map(c => {
    const p = cryptoPrices[c.symbol];
    if (!p || p === c.currentPrice) return c;
    changed = true;
    return { ...c, currentPrice: p };
  });
  return changed ? { ...data, stocks, crypto } : data;
};

/**
 * Balance to store when saving the account edit form. If the balance field
 * wasn't touched, keep the account's CURRENT balance: the form's value dates
 * from when it was opened, and purchases or captures booked since then would
 * otherwise be erased (and a card in favour would flip into debt, since the
 * owed field is shown as a positive number).
 */
export const resolveEditedBalance = ({ current, typed, typedAtOpen, isCredit }: {
  current: number;
  typed: string;
  typedAtOpen: string;
  isCredit: boolean;
}): number => {
  if (typed === typedAtOpen) return current;
  const entered = parseAmount(typed) ?? 0;
  return isCredit ? -Math.abs(entered) : entered;
};
