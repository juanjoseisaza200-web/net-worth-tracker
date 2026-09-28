/**
 * Parse a user-entered amount string into a number.
 *
 * Accepts a comma or dot as the decimal separator. Returns `null` for anything
 * that isn't a finite number — empty string, a lone "-" or ".", letters — so
 * callers can block a save instead of storing `NaN`. A stored `NaN` amount is
 * subtracted from account balances and flows into every total, poisoning the
 * whole net-worth calculation with no error thrown.
 */
export const parseAmount = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(',', '.');
  if (normalized === '') return null;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
};

/**
 * Display form of a raw typed amount: comma thousands separators on the whole
 * part, decimals left exactly as typed (including a trailing "." mid-entry).
 */
export const groupThousands = (raw: string): string => {
  const [whole, ...rest] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${grouped}.${rest.join('.')}` : grouped;
};

/**
 * Inverse of groupThousands for what the user typed or pasted. A comma with
 * 0-2 digits after it at the end (and no "." elsewhere) is the decimal
 * separator — thousands groups always have 3 digits — so "1,234," and a pasted
 * "1234567,5" work with Spanish keyboards. When deleting, commas are only
 * stripped: backspace on "1,234" leaves "1,23", which means 123, not 1.23.
 */
export const ungroupTyped = (display: string, isDeletion = false): string => {
  const decimalComma = !isDeletion && !display.includes('.') && /,\d{0,2}$/.test(display);
  if (!decimalComma) return display.replace(/,/g, '');
  const i = display.lastIndexOf(',');
  return `${display.slice(0, i).replace(/,/g, '')}.${display.slice(i + 1)}`;
};

/** Stored amount -> editable string, rounded to cents to drop float noise. */
export const toEditableAmount = (amount: number): string =>
  String(Math.round(amount * 100) / 100);
