import { describe, it, expect } from 'vitest';
import { convertCurrency, sanitizeCurrency, SUPPORTED_CURRENCIES, formatCurrency } from './currency';

describe('convertCurrency', () => {
  it('returns the same amount when currencies match', () => {
    expect(convertCurrency(100, 'USD', 'USD')).toBe(100);
    expect(convertCurrency(100, 'COP', 'COP')).toBe(100);
  });

  it('converts through the USD pivot', () => {
    // 1 COP = 0.00024 USD (hardcoded default), so 1 USD ~= 4166.67 COP
    expect(convertCurrency(1, 'USD', 'COP')).toBeCloseTo(1 / 0.00024, 5);
    expect(convertCurrency(10000, 'COP', 'USD')).toBeCloseTo(2.4, 5);
  });

  it('round-trips without meaningful loss', () => {
    const there = convertCurrency(250, 'USD', 'COP');
    expect(convertCurrency(there, 'COP', 'USD')).toBeCloseTo(250, 6);
  });
});

describe('sanitizeCurrency', () => {
  it('keeps supported currencies', () => {
    expect(sanitizeCurrency('USD')).toBe('USD');
    expect(sanitizeCurrency('COP')).toBe('COP');
  });

  it('coerces unsupported / missing currencies to USD', () => {
    expect(sanitizeCurrency('EUR')).toBe('USD');
    expect(sanitizeCurrency('JPY')).toBe('USD');
    expect(sanitizeCurrency(undefined)).toBe('USD');
    expect(sanitizeCurrency(null)).toBe('USD');
    expect(sanitizeCurrency('')).toBe('USD');
  });

  it('only supports USD and COP', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['USD', 'COP']);
  });
});

describe('formatCurrency', () => {
  it('formats with two decimals', () => {
    expect(formatCurrency(1234.5, 'USD')).toContain('1,234.50');
  });
});
