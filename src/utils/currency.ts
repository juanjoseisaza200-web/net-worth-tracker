import { Currency } from '../types';

// Exchange rates cache (in a real app, you'd fetch these from an API)
const exchangeRates: Record<Currency, number> = {
  USD: 1,
  COP: 0.00024, // 1 COP = 0.00024 USD (approximate)
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  CAD: 0.74,
  AUD: 0.66,
};

// In production, you would fetch real-time rates from an API like:
// https://api.exchangerate-api.com/v4/latest/USD
// or https://openexchangerates.org/

export const convertCurrency = (
  amount: number,
  from: Currency,
  to: Currency
): number => {
  if (from === to) return amount;

  // Convert to USD first, then to target currency
  const usdAmount = amount * exchangeRates[from];
  return usdAmount / exchangeRates[to];
};

export const formatCurrency = (amount: number, currency: Currency): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  });
  return formatter.format(amount);
};

export const formatCompactCurrency = (amount: number, currency: Currency): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 2,
  });
  return formatter.format(amount);
};

export const formatAdaptiveCurrency = (amount: number, currency: Currency): string => {
  // 1. Try full formatting
  const fullFormat = formatCurrency(amount, currency);

  // If it fits (heuristic: < 14 chars), return full format
  if (fullFormat.length < 14) {
    return fullFormat;
  }

  // 2. Try removing cents if it helps fit
  const noCentsFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const noCentsFormat = noCentsFormatter.format(amount);

  if (noCentsFormat.length < 14) {
    return noCentsFormat;
  }

  // 3. Fallback to compact notation
  return formatCompactCurrency(amount, currency);
};

export let lastExchangeRatesUpdate: Date | null = null;
export let isUsingLiveRates: boolean = false;

// Function to fetch real-time exchange rates
export const fetchExchangeRates = async (): Promise<boolean> => {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    if (data && data.rates) {
      Object.keys(exchangeRates).forEach(currency => {
        if (data.rates[currency]) {
          // The API provides rates relative to USD.
          // Since our exchangeRates object stores 1 USD = X Currency, 
          // we can just map it directly. Wait, our hardcoded COP is 0.00024.
          // That implies our exchangeRates meant 1 COP = 0.00024 USD!
          // Let's check `convertCurrency` logic!
          // `usdAmount = amount * exchangeRates[from]`
          // `return usdAmount / exchangeRates[to]`
          // Ah! If `exchangeRates` stores the value of 1 unit in USD...
          // But the API returns 1 USD = 3637 COP. So 1 COP = 1 / 3637 USD.
          exchangeRates[currency as Currency] = 1 / data.rates[currency];
        }
      });
      lastExchangeRatesUpdate = new Date();
      isUsingLiveRates = true;
      console.log('Exchange rates updated live from open.er-api.com');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error fetching live exchange rates, falling back to hardcoded rates:', error);
    isUsingLiveRates = false;
    return false;
  }
};

export const formatCurrencyNoDecimals = (amount: number, currency: Currency): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(amount);
};

