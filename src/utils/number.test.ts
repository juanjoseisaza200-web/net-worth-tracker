import { describe, it, expect } from 'vitest';
import { parseAmount, groupThousands, ungroupTyped, toEditableAmount } from './number';

describe('parseAmount', () => {
  it('parses plain and decimal numbers', () => {
    expect(parseAmount('100')).toBe(100);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount(42)).toBe(42);
  });

  it('accepts a comma as the decimal separator', () => {
    expect(parseAmount('12,5')).toBe(12.5);
  });

  it('returns null for values that would become NaN', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it('handles zero and negative values (caller decides if allowed)', () => {
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('-5')).toBe(-5);
  });
});

describe('groupThousands', () => {
  it('adds comma separators to the whole part', () => {
    expect(groupThousands('5305255.75')).toBe('5,305,255.75');
    expect(groupThousands('1000')).toBe('1,000');
    expect(groupThousands('999')).toBe('999');
  });

  it('keeps what the user is still typing', () => {
    expect(groupThousands('')).toBe('');
    expect(groupThousands('1234.')).toBe('1,234.');
    expect(groupThousands('.5')).toBe('.5');
  });
});

describe('ungroupTyped', () => {
  it('strips thousands separators', () => {
    expect(ungroupTyped('5,305,255.75')).toBe('5305255.75');
  });

  it('treats a comma typed at the end as the decimal separator', () => {
    // iPhone keyboards in Spanish offer "," for decimals.
    expect(ungroupTyped('1,234,')).toBe('1234.');
  });

  it('reads a pasted Colombian-format amount', () => {
    // A comma with fewer than 3 digits after it can't be a thousands separator.
    expect(ungroupTyped('1234567,5')).toBe('1234567.5');
    expect(ungroupTyped('12,50')).toBe('12.50');
  });

  it('keeps growing thousands groups while typing digits', () => {
    expect(ungroupTyped('1,2345')).toBe('12345');
    expect(ungroupTyped('1,234.5')).toBe('1234.5');
  });

  it('only strips separators when deleting', () => {
    // Backspace on "1,234" leaves "1,23": that's 123, not 1.23.
    expect(ungroupTyped('1,23', true)).toBe('123');
  });

  it('round-trips with groupThousands', () => {
    for (const raw of ['0', '12', '1234', '1234.5', '1234567.89']) {
      expect(ungroupTyped(groupThousands(raw))).toBe(raw);
    }
  });
});

describe('toEditableAmount', () => {
  it('rounds float noise to cents for editing', () => {
    expect(toEditableAmount(5305255.752083641)).toBe('5305255.75');
    expect(toEditableAmount(1577772)).toBe('1577772');
    expect(toEditableAmount(12.5)).toBe('12.5');
  });
});
