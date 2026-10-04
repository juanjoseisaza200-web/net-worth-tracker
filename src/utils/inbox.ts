import { Account, AppData, Currency, Expense, Income } from '../types';
import { convertCurrency } from './currency';
import { expenseCategories } from './categories';
import { parseBancolombiaSms, parseSmsAmount } from './bancolombiaSms';
import { claimSubscriptionCharge } from './subscriptions';

/**
 * Automatic capture: the iPhone shortcuts drop raw items into
 * `inboxes/{key}/items` and this module decides what each one becomes.
 *
 * - A categorised Apple Pay capture on a known card is booked as an expense.
 * - A bank SMS for a purchase is paired one-to-one with an Apple Pay capture
 *   (same account, same amount, within PAIR_WINDOW_MS) and dropped, so a
 *   purchase is never counted twice — while two identical purchases minutes
 *   apart (a split bill) still get one SMS each.
 * - A card SMS whose merchant matches a subscription's `smsMatch` is booked
 *   as that subscription's charge (see claimSubscriptionCharge).
 * - Everything else waits in the review queue.
 *
 * - An Apple Pay item with no amount is a "note": the shortcut only sends the
 *   category/description the user picked and the tap time. It is joined to
 *   the bank SMS of that purchase (nearest within PAIR_WINDOW_MS, one each),
 *   which supplies amount, merchant and card. A note no SMS claims is dropped
 *   after NOTE_TTL_MS.
 *
 * Booked records take the id `inbox-<itemId>`, so re-processing an item whose
 * deletion hadn't landed yet is a no-op instead of a duplicate.
 */

export interface InboxItem {
  id: string;
  source: 'applepay' | 'sms';
  /** sms: full message text. */
  text?: string;
  /** applepay fields, as sent by the shortcut. */
  amount?: string;
  merchant?: string;
  card?: string;
  category?: string;
  description?: string;
  /** applepay: ISO timestamp of the tap. */
  at?: string;
}

export interface PendingEntry {
  itemId: string;
  origin: 'applepay' | 'sms';
  kind: 'expense' | 'income';
  amount: number;
  currency: Currency;
  description: string;
  /** Suggested category, '' when there is none. */
  category: string;
  date: string;
  time: string;
  /** '' when no account matches the card/last digits. */
  accountId: string;
  /** Why this needs a human. */
  reason: string;
  /** applepay: ISO time of the tap, kept so the booked expense can still pair with its SMS. */
  capturedAt?: string;
}

export interface InboxResult {
  /** Same reference as the input when nothing was booked or paired. */
  data: AppData;
  /** Items that are fully handled and can be removed from Firestore. */
  deleteIds: string[];
  pending: PendingEntry[];
}

const PAIR_WINDOW_MS = 15 * 60 * 1000;
const NOTE_TTL_MS = 24 * 60 * 60 * 1000;

const TEXT_FIELDS = ['text', 'amount', 'merchant', 'card', 'category', 'description', 'at'] as const;

/**
 * Inbox items come from shortcuts through the REST API, so their fields can be
 * anything (a shortcut can send the amount as a number). Keep only the known
 * fields, as strings; one malformed item must not crash processing.
 */
export const sanitizeInboxItem = (id: string, raw: Record<string, unknown>): InboxItem | null => {
  if (raw.source !== 'applepay' && raw.source !== 'sms') return null;
  const item: InboxItem = { id, source: raw.source };
  for (const key of TEXT_FIELDS) {
    const v = raw[key];
    if (typeof v === 'string') item[key] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') item[key] = String(v);
  }
  return item;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Amount from the shortcut: a plain number, or bank-style "$30.000,00". */
export const parseCaptureAmount = (raw: string | undefined): number | null => {
  const s = (raw || '').replace(/[^\d.,]/g, '');
  if (s === '') return null;
  if (/^\d+(\.\d{1,2})?$/.test(s)) return Number(s);
  return parseSmsAmount(s);
};

const findAccount = (accounts: Account[], key: string | undefined): Account | undefined => {
  const k = (key || '').trim().toLowerCase();
  if (!k) return undefined;
  return accounts.find(a => (a.matchKeys || []).some(m => m.trim().toLowerCase() === k));
};

const localDateTime = (d: Date) => ({
  date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
});

/** Bancolombia SMS times are Colombia time (UTC-5, no DST), wherever the phone is. */
const timeOf = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h + 5, mi);
};

const withBalance = (accounts: Account[], accountId: string, delta: number, currency: Currency) =>
  accounts.map(a => (a.id === accountId
    ? { ...a, balance: a.balance + convertCurrency(delta, currency, a.currency) }
    : a));

/**
 * True if `data` holds the effect of an inbox item: its booked expense/income,
 * or an expense paired with it. Used to delete an item from the inbox only
 * once that effect is confirmed saved on the server.
 */
export const isRecordedIn = (data: AppData, itemId: string): boolean => {
  const id = `inbox-${itemId}`;
  return data.expenses.some(e => e.id === id || e.capture?.pairedItemId === itemId)
    || data.incomes.some(i => i.id === id);
};

/** Book a reviewed entry as an expense or income. No-op if already booked. */
export const applyEntry = (data: AppData, entry: PendingEntry): AppData => {
  const id = `inbox-${entry.itemId}`;
  const record = {
    id,
    amount: entry.amount,
    currency: entry.currency,
    description: entry.description,
    category: entry.category,
    date: entry.date,
    accountId: entry.accountId,
    // Without this the bank SMS for the same purchase couldn't pair with it
    // and would show up for review again — a double count if confirmed.
    ...(entry.origin === 'applepay' && entry.kind === 'expense' && entry.capturedAt
      ? { capture: { via: 'applepay' as const, at: entry.capturedAt } }
      : {}),
  };
  if (entry.kind === 'income') {
    if (data.incomes.some(i => i.id === id)) return data;
    return {
      ...data,
      incomes: [...data.incomes, record as Income],
      accounts: withBalance(data.accounts, entry.accountId, entry.amount, entry.currency),
    };
  }
  if (data.expenses.some(e => e.id === id)) return data;
  return {
    ...data,
    expenses: [...data.expenses, record as Expense],
    accounts: withBalance(data.accounts, entry.accountId, -entry.amount, entry.currency),
  };
};

/** Something an SMS can pair with: a booked expense or an Apple Pay item still in review. */
interface PairTarget {
  accountId: string;
  amount: number;
  at: number;
  pairedItemId?: string;
  expenseId?: string;
}

export const processInbox = (input: AppData, items: InboxItem[]): InboxResult => {
  let data = input;
  const deleteIds: string[] = [];
  const pending: PendingEntry[] = [];
  const targets: PairTarget[] = [];
  const notes: { itemId: string; at: number; category: string; description: string; accountId?: string; claimed?: boolean }[] = [];

  // Apple Pay first, so SMS in the same batch can pair with what it books.
  for (const item of items.filter(i => i.source === 'applepay')) {
    if (!(item.amount || '').trim()) {
      // A note: joined to its bank SMS in the SMS loop below.
      const at = item.at ? new Date(item.at).getTime() : NaN;
      if (data.expenses.some(e => e.id === `inbox-${item.id}`) || Number.isNaN(at) || Date.now() - at > NOTE_TTL_MS) {
        deleteIds.push(item.id);
        continue;
      }
      notes.push({
        itemId: item.id,
        at,
        category: expenseCategories.includes(item.category || '') ? item.category! : '',
        description: (item.description || '').trim(),
        accountId: findAccount(data.accounts, item.card)?.id,
      });
      continue;
    }
    const amount = parseCaptureAmount(item.amount);
    if (amount === null || amount <= 0) {
      deleteIds.push(item.id);
      continue;
    }
    const tapped = item.at ? new Date(item.at) : new Date(NaN);
    const when = Number.isNaN(tapped.getTime()) ? new Date() : tapped;
    const { date, time } = localDateTime(when);
    const account = findAccount(data.accounts, item.card);
    const category = expenseCategories.includes(item.category || '') ? item.category! : '';
    const description = (item.description || '').trim() || (item.merchant || '').trim() || 'Apple Pay';

    const id = `inbox-${item.id}`;
    if (data.expenses.some(e => e.id === id)) {
      deleteIds.push(item.id);
      continue;
    }

    if (account && category) {
      const expense: Expense = {
        id,
        amount,
        currency: account.currency,
        description,
        category,
        date,
        accountId: account.id,
        capture: { via: 'applepay', at: when.toISOString() },
      };
      data = {
        ...data,
        expenses: [...data.expenses, expense],
        accounts: withBalance(data.accounts, account.id, -amount, account.currency),
      };
      deleteIds.push(item.id);
    } else {
      pending.push({
        itemId: item.id,
        origin: 'applepay',
        kind: 'expense',
        amount,
        currency: account?.currency ?? data.baseCurrency,
        description,
        category,
        date,
        time,
        accountId: account?.id ?? '',
        reason: account ? 'No category chosen' : `Card "${item.card || '?'}" not linked to an account`,
        capturedAt: when.toISOString(),
      });
      if (account) targets.push({ accountId: account.id, amount, at: when.getTime() });
    }
  }

  for (const e of data.expenses) {
    if (e.capture?.via !== 'applepay') continue;
    targets.push({
      accountId: e.accountId,
      amount: e.amount,
      at: new Date(e.capture.at).getTime(),
      pairedItemId: e.capture.pairedItemId,
      expenseId: e.id,
    });
  }

  const smsItems = items
    .filter(i => i.source === 'sms')
    .map(item => ({ item, sms: parseBancolombiaSms(item.text || '') }));

  // Oldest first, so each SMS claims the nearest still-unpaired purchase.
  smsItems.sort((a, b) => (a.sms && b.sms
    ? timeOf(a.sms.date, a.sms.time) - timeOf(b.sms.date, b.sms.time)
    : 0));

  for (const { item, sms } of smsItems) {
    // Confirmed from the review queue; the delete just hasn't landed yet.
    const bookedId = `inbox-${item.id}`;
    if (!sms || data.expenses.some(e => e.id === bookedId) || data.incomes.some(i => i.id === bookedId)) {
      deleteIds.push(item.id);
      continue;
    }
    const account = findAccount(data.accounts, sms.last4);
    let noteDescription = '';

    if (sms.kind === 'purchase') {
      // Already paired on an earlier pass whose delete didn't land.
      if (targets.some(t => t.pairedItemId === item.id)) {
        deleteIds.push(item.id);
        continue;
      }
      const at = timeOf(sms.date, sms.time);
      const match = account && targets
        .filter(t => !t.pairedItemId
          && t.accountId === account.id
          && Math.abs(t.amount - sms.amount) < 0.01
          && Math.abs(t.at - at) <= PAIR_WINDOW_MS)
        .sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];

      if (match) {
        match.pairedItemId = item.id;
        if (match.expenseId) {
          const expenseId = match.expenseId;
          data = {
            ...data,
            expenses: data.expenses.map(e => (e.id === expenseId && e.capture
              ? { ...e, capture: { ...e.capture, pairedItemId: item.id } }
              : e)),
          };
        }
        deleteIds.push(item.id);
        continue;
      }

      // An Apple Pay note from around the same time: the SMS gives the money,
      // the note gives what it was.
      const note = account && notes
        .filter(n => !n.claimed && (!n.accountId || n.accountId === account.id) && Math.abs(n.at - at) <= PAIR_WINDOW_MS)
        .sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
      if (note) {
        note.claimed = true;
        if (note.category) {
          const expense: Expense = {
            id: `inbox-${note.itemId}`,
            amount: sms.amount,
            currency: sms.currency,
            description: note.description || sms.counterparty,
            category: note.category,
            date: sms.date,
            accountId: account.id,
            capture: { via: 'applepay', at: new Date(note.at).toISOString(), pairedItemId: item.id },
          };
          data = {
            ...data,
            expenses: [...data.expenses, expense],
            accounts: withBalance(data.accounts, account.id, -sms.amount, sms.currency),
          };
          deleteIds.push(item.id, note.itemId);
          continue;
        }
        if (note.description) noteDescription = note.description;
      }

      // A subscription's monthly/yearly card charge pays that subscription.
      const claimed = account && !note && claimSubscriptionCharge(data, {
        itemId: item.id,
        merchant: sms.counterparty,
        accountId: account.id,
        amount: sms.amount,
        currency: sms.currency,
        date: sms.date,
      });
      if (claimed) {
        data = claimed;
        deleteIds.push(item.id);
        continue;
      }
    }

    const reason = {
      purchase: 'Card purchase with no Apple Pay capture',
      transfer_out: 'Transfer sent',
      transfer_in: 'Transfer received',
    }[sms.kind];
    const description = {
      purchase: noteDescription || sms.counterparty,
      transfer_out: `Transfer to ${sms.counterparty}`,
      transfer_in: `Transfer from ${sms.counterparty}`,
    }[sms.kind];

    pending.push({
      itemId: item.id,
      origin: 'sms',
      kind: sms.kind === 'transfer_in' ? 'income' : 'expense',
      amount: sms.amount,
      currency: sms.currency,
      description,
      category: sms.kind === 'purchase' ? '' : 'Other',
      date: sms.date,
      time: sms.time,
      accountId: account?.id ?? '',
      reason: account ? reason : `${reason} — *${sms.last4} not linked to an account`,
    });
  }

  return { data, deleteIds, pending };
};
