import { Currency } from '../types';

/**
 * Parser for Bancolombia notification SMS.
 *
 * Bancolombia is inconsistent between message types: purchases use Colombian
 * number format ("$70.199,00") and four-digit years, transfers use US format
 * ("$330,000.00") and two-digit years. Anything unrecognised returns `null`
 * so callers can ignore OTPs and marketing texts instead of guessing.
 */

export type SmsKind = 'purchase' | 'transfer_out' | 'transfer_in';

export interface ParsedSms {
  kind: SmsKind;
  amount: number;
  currency: Currency;
  /** Merchant for purchases (truncated by the bank), person for transfers. */
  counterparty: string;
  /** What the last four digits belong to. */
  source: 'credit' | 'debit' | 'account';
  last4: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24h */
  time: string;
}

/**
 * Parse an amount in either Colombian or US format. The last separator is the
 * decimal one only when exactly two digits follow it; otherwise every
 * separator is a thousands separator ("30.000" is thirty thousand).
 */
export const parseSmsAmount = (raw: string): number | null => {
  const s = raw.trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const decimal = s.match(/[.,](\d{2})$/);
  const intPart = decimal ? s.slice(0, -3) : s;
  const n = Number(intPart.replace(/[.,]/g, '') + (decimal ? `.${decimal[1]}` : ''));
  return Number.isFinite(n) ? n : null;
};

const AMOUNT = '(COP|USD|\\$)\\s?(\\d[\\d.,]*\\d)';
const DATE_TIME = '(\\d{2})\\/(\\d{2})\\/(\\d{2,4}) a las (\\d{1,2}):(\\d{2})';

const PURCHASE = new RegExp(`Compraste ${AMOUNT} en (.+?) con tu T\\.(Cred|Deb) \\*(\\d{4}),? el ${DATE_TIME}`, 'i');
// Same purchase, worded with the card at the end (seen on online/subscription charges):
// "Compraste COP20.900,00 en OPENAI *CHATGPT SUBS, el 12/10/2026 a las 16:39. Esta compra esta asociada a T.Cred *1342."
const PURCHASE_CARD_LAST = new RegExp(`Compraste ${AMOUNT} en (.+?),? el ${DATE_TIME}\\.? Esta compra est[aá] asociada a T\\.(Cred|Deb) \\*(\\d{4})`, 'i');
const TRANSFER_OUT = new RegExp(`transferiste ${AMOUNT} .*?desde tu cuenta \\*(\\d{4}) a (.+?) el ${DATE_TIME}`, 'i');
const TRANSFER_IN = new RegExp(`recibiste una transferencia de (.+?) por ${AMOUNT} en tu cuenta \\*(\\d{4}).*? el ${DATE_TIME}`, 'i');

const toCurrency = (symbol: string): Currency => (symbol.toUpperCase() === 'USD' ? 'USD' : 'COP');

const toDate = (dd: string, mm: string, yy: string) =>
  `${yy.length === 2 ? `20${yy}` : yy}-${mm}-${dd}`;

const toTime = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

const purchase = (cur: string, amt: string, merchant: string, card: string, last4: string,
  dd: string, mo: string, yy: string, h: string, mi: string): ParsedSms | null => {
  const amount = parseSmsAmount(amt);
  if (amount === null) return null;
  return {
    kind: 'purchase',
    amount,
    currency: toCurrency(cur),
    counterparty: merchant.trim(),
    source: card.toLowerCase() === 'cred' ? 'credit' : 'debit',
    last4,
    date: toDate(dd, mo, yy),
    time: toTime(h, mi),
  };
};

export const parseBancolombiaSms = (text: string): ParsedSms | null => {
  let m = text.match(PURCHASE);
  if (m) {
    const [, cur, amt, merchant, card, last4, dd, mo, yy, h, mi] = m;
    return purchase(cur, amt, merchant, card, last4, dd, mo, yy, h, mi);
  }

  m = text.match(PURCHASE_CARD_LAST);
  if (m) {
    const [, cur, amt, merchant, dd, mo, yy, h, mi, card, last4] = m;
    return purchase(cur, amt, merchant, card, last4, dd, mo, yy, h, mi);
  }

  m = text.match(TRANSFER_OUT);
  if (m) {
    const [, cur, amt, last4, person, dd, mo, yy, h, mi] = m;
    const amount = parseSmsAmount(amt);
    if (amount === null) return null;
    return {
      kind: 'transfer_out',
      amount,
      currency: toCurrency(cur),
      counterparty: person.trim(),
      source: 'account',
      last4,
      date: toDate(dd, mo, yy),
      time: toTime(h, mi),
    };
  }

  m = text.match(TRANSFER_IN);
  if (m) {
    const [, person, cur, amt, last4, dd, mo, yy, h, mi] = m;
    const amount = parseSmsAmount(amt);
    if (amount === null) return null;
    return {
      kind: 'transfer_in',
      amount,
      currency: toCurrency(cur),
      counterparty: person.trim(),
      source: 'account',
      last4,
      date: toDate(dd, mo, yy),
      time: toTime(h, mi),
    };
  }

  return null;
};

export interface LooseSms {
  kind: 'expense' | 'income';
  amount: number;
  currency: Currency;
  last4?: string;
  /** YYYY-MM-DD, when the text has a date. */
  date?: string;
  /** HH:MM, when the text has a time. */
  time?: string;
}

/**
 * Best guess at a bank message none of the known formats matched, so it can
 * go to review instead of being lost. Null when the text holds no amount —
 * codes and marketing texts are dropped as before.
 */
export const parseLooseSms = (text: string): LooseSms | null => {
  const money = text.match(new RegExp(AMOUNT, 'i'));
  const amount = money ? parseSmsAmount(money[2]) : null;
  if (!money || amount === null || amount <= 0) return null;
  const card = text.match(/\*(\d{4})/);
  const date = text.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  const time = text.match(/a las (\d{1,2}):(\d{2})/i);
  return {
    kind: /recibiste|te consignaron|abono/i.test(text) ? 'income' : 'expense',
    amount,
    currency: toCurrency(money[1]),
    ...(card ? { last4: card[1] } : {}),
    ...(date ? { date: toDate(date[1], date[2], date[3]) } : {}),
    ...(time ? { time: toTime(time[1], time[2]) } : {}),
  };
};
