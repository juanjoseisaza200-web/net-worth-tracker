import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatDateForDisplay, todayLocal } from './date';

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

describe('todayLocal', () => {
  afterEach(() => vi.useRealTimers());

  it("uses the device's local date, not UTC", () => {
    // 8:30 pm local on Sep 30: in Colombia (UTC-5) that is already Oct 1 in
    // UTC, which is what toISOString() used to put in the date field.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 20, 30));
    expect(todayLocal()).toBe('2026-09-30');
  });

  it('zero-pads month and day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 9, 0));
    expect(todayLocal()).toBe('2026-01-05');
  });
});
