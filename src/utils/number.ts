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
