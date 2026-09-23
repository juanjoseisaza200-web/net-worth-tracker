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
const TRANSFER_OUT = new RegExp(`transferiste ${AMOUNT} .*?desde tu cuenta \\*(\\d{4}) a (.+?) el ${DATE_TIME}`, 'i');
const TRANSFER_IN = new RegExp(`recibiste una transferencia de (.+?) por ${AMOUNT} en tu cuenta \\*(\\d{4}).*? el ${DATE_TIME}`, 'i');

const toCurrency = (symbol: string): Currency => (symbol.toUpperCase() === 'USD' ? 'USD' : 'COP');

const toDate = (dd: string, mm: string, yy: string) =>
  `${yy.length === 2 ? `20${yy}` : yy}-${mm}-${dd}`;

const toTime = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

export const parseBancolombiaSms = (text: string): ParsedSms | null => {
  let m = text.match(PURCHASE);
  if (m) {
    const [, cur, amt, merchant, card, last4, dd, mo, yy, h, mi] = m;
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
