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
