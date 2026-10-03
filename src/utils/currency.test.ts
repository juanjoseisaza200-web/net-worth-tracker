import { describe, it, expect } from 'vitest';
import { convertCurrency, sanitizeCurrency, SUPPORTED_CURRENCIES, formatCurrency, formatCurrencyTrimmed, viewCurrencyFor, withViewCurrency } from './currency';
import { AppData } from '../types';

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

describe('formatCurrencyTrimmed', () => {
  it('drops .00 on whole amounts', () => {
    expect(formatCurrencyTrimmed(330000, 'COP')).toBe(formatCurrency(330000, 'COP').replace('.00', ''));
  });

  it('keeps two decimals when there are cents', () => {
    expect(formatCurrencyTrimmed(603729.43, 'COP')).toBe(formatCurrency(603729.43, 'COP'));
    expect(formatCurrencyTrimmed(12.5, 'USD')).toBe('$12.50');
  });

  it('treats float noise below a cent as whole', () => {
    expect(formatCurrencyTrimmed(1577772.0000001, 'COP')).toBe(formatCurrency(1577772, 'COP').replace('.00', ''));
  });
});

describe('view currencies', () => {
  const data = (settings?: AppData['settings']) => ({ baseCurrency: 'COP', settings } as AppData);

  it('falls back to the base currency for a screen never set', () => {
    expect(viewCurrencyFor(data(), 'stock')).toBe('COP');
    expect(viewCurrencyFor(data({ autoUpdatePrices: true, viewCurrencies: { expenses: 'USD' } }), 'stock')).toBe('COP');
  });

  it('remembers each screen separately and keeps other settings', () => {
    let d = withViewCurrency(data({ autoUpdatePrices: false, inboxKey: 'k' }), 'stock', 'USD');
    d = withViewCurrency(d, 'expenses', 'COP');
    expect(viewCurrencyFor(d, 'stock')).toBe('USD');
    expect(viewCurrencyFor(d, 'expenses')).toBe('COP');
    expect(d.settings).toMatchObject({ autoUpdatePrices: false, inboxKey: 'k' });
  });

  it('defaults autoUpdatePrices on when settings did not exist yet', () => {
    expect(withViewCurrency(data(), 'fixed', 'USD').settings?.autoUpdatePrices).toBe(true);
  });
});
