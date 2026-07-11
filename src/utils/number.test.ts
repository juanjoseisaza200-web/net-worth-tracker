import { describe, it, expect } from 'vitest';
import { parseAmount } from './number';

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
