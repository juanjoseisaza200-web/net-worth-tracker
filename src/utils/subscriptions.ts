import { Account, AppData, Currency, Expense, Subscription } from '../types';
import { convertCurrency } from './currency';

/**
 * Subscriptions are charged on their billing date as an expense on their
 * account. Each tracks the last billing period it paid (`lastChargedPeriod`:
 * 'YYYY-MM' monthly, 'YYYY' yearly), so missed periods are all caught up and
 * nothing is charged twice.
 *
 * A subscription with `smsMatch` is normally paid by its bank SMS (see
 * claimSubscriptionCharge, called from the capture inbox), which has the real
 * amount. Its scheduled charge waits SMS_GRACE_DAYS for that SMS and is
 * replaced if the SMS shows up later.
 */

const SMS_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Period that holds `date` ('YYYY-MM' or 'YYYY'). */
const periodOf = (sub: Subscription, y: number, m: number) => {
  const d = new Date(y, m - 1, 1);
  return sub.frequency === 'yearly' ? String(d.getFullYear()) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const shiftPeriod = (sub: Subscription, period: string, by: number) => {
  if (sub.frequency === 'yearly') return String(Number(period) + by);
  const [y, m] = period.split('-').map(Number);
  return periodOf(sub, y, m + by);
};

/** YYYY-MM-DD the subscription is charged in `period`, clamped to the month's length. */
export const billingDate = (sub: Subscription, period: string): string => {
  const [y, mm] = sub.frequency === 'yearly'
    ? [Number(period), sub.billingMonth ?? 1]
    : period.split('-').map(Number);
  const lastDay = new Date(y, mm, 0).getDate();
  return `${y}-${pad(mm)}-${pad(Math.min(sub.billingDay, lastDay))}`;
};

/** Latest period whose billing date is on or before `today`: treated as already paid. */
export const initialChargedPeriod = (sub: Subscription, today: Date): string => {
  const current = periodOf(sub, today.getFullYear(), today.getMonth() + 1);
  return billingDate(sub, current) <= ymd(today) ? current : shiftPeriod(sub, current, -1);
};

export const nextChargeDate = (sub: Subscription, today = new Date()): string =>
  billingDate(sub, shiftPeriod(sub, sub.lastChargedPeriod ?? initialChargedPeriod(sub, today), 1));

/** Billing period whose date is nearest to `date` (a charge can land a day early or late). */
export const periodForDate = (sub: Subscription, date: string): string => {
  const d = parseYmd(date);
  const here = periodOf(sub, d.getFullYear(), d.getMonth() + 1);
  return [-1, 0, 1]
    .map(by => shiftPeriod(sub, here, by))
    .sort((a, b) => Math.abs(parseYmd(billingDate(sub, a)).getTime() - d.getTime())
      - Math.abs(parseYmd(billingDate(sub, b)).getTime() - d.getTime()))[0];
};

export const monthlyCost = (sub: Subscription): number =>
  sub.frequency === 'yearly' ? sub.amount / 12 : sub.amount;

const withBalance = (accounts: Account[], accountId: string, delta: number, currency: Currency) =>
  accounts.map(a => (a.id === accountId
    ? { ...a, balance: a.balance + convertCurrency(delta, currency, a.currency) }
    : a));

/** Charge every billing period that has come due. Same reference back when nothing changed. */
export function processSubscriptions(data: AppData, today = new Date()): { newData: AppData; messages: string[] } {
  const subs = data.subscriptions ?? [];
  let next = data;
  const messages: string[] = [];
  const updated = subs.map(sub => {
    if (!sub.isActive || !data.accounts.some(a => a.id === sub.accountId)) return sub;
    if (!sub.lastChargedPeriod) return { ...sub, lastChargedPeriod: initialChargedPeriod(sub, today) };

    const cutoff = ymd(new Date(today.getTime() - (sub.smsMatch?.trim() ? SMS_GRACE_DAYS * DAY_MS : 0)));
    let last = sub.lastChargedPeriod;
    // Bounded so a corrupt period can't loop forever (24 = two years of months).
    for (let i = 0; i < 24; i++) {
      const period = shiftPeriod(sub, last, 1);
      const date = billingDate(sub, period);
      if (date > cutoff) break;
      const id = `sub-${sub.id}-${period}`;
      if (!next.expenses.some(e => e.id === id)) {
        const expense: Expense = {
          id,
          amount: sub.amount,
          currency: sub.currency,
          description: sub.name,
          category: sub.category,
          date,
          accountId: sub.accountId,
          subscription: { id: sub.id, period },
        };
        next = {
          ...next,
          expenses: [...next.expenses, expense],
          accounts: withBalance(next.accounts, sub.accountId, -sub.amount, sub.currency),
        };
        messages.push(`Subscription "${sub.name}": ${sub.amount} ${sub.currency} charged on ${date}.`);
      }
      last = period;
    }
    return last === sub.lastChargedPeriod ? sub : { ...sub, lastChargedPeriod: last };
  });

  if (next === data && updated.every((s, i) => s === subs[i])) return { newData: data, messages: [] };
  return { newData: { ...next, subscriptions: updated }, messages };
}

export interface SmsCharge {
  itemId: string;
  merchant: string;
  accountId: string;
  amount: number;
  currency: Currency;
  date: string;
}

/**
 * Book a bank-SMS card charge as the payment of the subscription whose
 * `smsMatch` appears in the merchant. Replaces (and refunds) a scheduled
 * charge already booked for that period. Null when no subscription matches.
 */
export const claimSubscriptionCharge = (data: AppData, charge: SmsCharge): AppData | null => {
  const merchant = charge.merchant.toLowerCase();
  const sub = (data.subscriptions ?? []).find(s =>
    s.isActive && s.smsMatch?.trim() && merchant.includes(s.smsMatch.trim().toLowerCase()));
  if (!sub) return null;

  const period = periodForDate(sub, charge.date);
  let accounts = data.accounts;
  const scheduled = data.expenses.find(e => e.id === `sub-${sub.id}-${period}`);
  if (scheduled) accounts = withBalance(accounts, scheduled.accountId, scheduled.amount, scheduled.currency);

  const expense: Expense = {
    id: `inbox-${charge.itemId}`,
    amount: charge.amount,
    currency: charge.currency,
    description: sub.name,
    category: sub.category,
    date: charge.date,
    accountId: charge.accountId,
    subscription: { id: sub.id, period },
  };
  return {
    ...data,
    expenses: [...data.expenses.filter(e => e !== scheduled), expense],
    accounts: withBalance(accounts, charge.accountId, -charge.amount, charge.currency),
    subscriptions: (data.subscriptions ?? []).map(s => (s.id === sub.id && (!s.lastChargedPeriod || s.lastChargedPeriod < period)
      ? { ...s, lastChargedPeriod: period }
      : s)),
  };
};
