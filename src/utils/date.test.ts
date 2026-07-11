import { describe, it, expect } from 'vitest';
import { formatDateForDisplay } from './date';

describe('formatDateForDisplay', () => {
  it('returns empty string for empty input', () => {
    expect(formatDateForDisplay('')).toBe('');
  });

  it('keeps the same calendar day (no timezone shift)', () => {
    // Parsing '2026-01-15' must land on Jan 15 in local time, not shift a day.
    const out = formatDateForDisplay('2026-01-15');
    const expected = new Date(2026, 0, 15).toLocaleDateString();
    expect(out).toBe(expected);
  });
});
