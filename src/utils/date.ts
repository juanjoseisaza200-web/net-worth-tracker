/**
 * Format a YYYY-MM-DD date string for display in the user's locale
 * whilst preventing timezone shifts (defaults to local timezone).
 */
export const formatDateForDisplay = (dateString: string): string => {
    if (!dateString) return '';

    // Split YYYY-MM-DD and create date using local time constructor
    // new Date(y, m, d) uses local browser timezone, ensuring it stays on the correct day
    const [year, month, day] = dateString.split('-').map(Number);

    // Note: month is 0-indexed in JS Date constructor
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString();
};

/** Day-of-month suffix: 1 -> "st", 2 -> "nd", 11 -> "th", 23 -> "rd". */
export function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

/**
 * Today as YYYY-MM-DD in the device's local time zone. Don't use
 * `new Date().toISOString()` for this: that is UTC, so in Colombia (UTC-5) it
 * already says tomorrow from 7 pm, and the last day of a month rolls into the
 * next one.
 */
export const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
