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
    maximumFractionDigits: 1,
  });
  return formatter.format(amount);
};

// Function to fetch real-time exchange rates (placeholder for API integration)
export const fetchExchangeRates = async (): Promise<void> => {
  try {
    // Example API call (uncomment and configure when ready):
    // const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    // const data = await response.json();
    // Object.keys(exchangeRates).forEach(currency => {
    //   if (data.rates[currency]) {
    //     exchangeRates[currency] = 1 / data.rates[currency];
    //   }
    // });
    console.log('Exchange rates updated');
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
  }
};

