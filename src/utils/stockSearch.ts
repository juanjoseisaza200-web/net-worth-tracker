import { Suggestion } from '../components/AutocompleteInput';

export type StockSuggestion = Suggestion;

// Popular stocks list as fallback when API is unavailable
const POPULAR_STOCKS: StockSuggestion[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE' },
  { symbol: 'V', name: 'Visa Inc.', exchange: 'NYSE' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE' },
  { symbol: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE' },
  { symbol: 'PG', name: 'Procter & Gamble Co.', exchange: 'NYSE' },
  { symbol: 'MA', name: 'Mastercard Inc.', exchange: 'NYSE' },
  { symbol: 'DIS', name: 'The Walt Disney Company', exchange: 'NYSE' },
  { symbol: 'NFLX', name: 'Netflix, Inc.', exchange: 'NASDAQ' },
  { symbol: 'BAC', name: 'Bank of America Corp.', exchange: 'NYSE' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', exchange: 'NYSE' },
  { symbol: 'HD', name: 'The Home Depot, Inc.', exchange: 'NYSE' },
  { symbol: 'PYPL', name: 'PayPal Holdings, Inc.', exchange: 'NASDAQ' },
  { symbol: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ' },
];

// Cache for API responses
const searchCache = new Map<string, StockSuggestion[]>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Search for stock symbols using Yahoo Finance API
 * Falls back to static list if API fails
 */
export const searchStockSymbols = async (query: string): Promise<Suggestion[]> => {
  if (!query || query.length < 1) {
    return [];
  }

  const upperQuery = query.toUpperCase().trim();

  // Check cache first
  const cacheKey = upperQuery;
  const cached = searchCache.get(cacheKey);
  const cacheTime = cacheTimestamps.get(cacheKey);
  if (cached && cacheTime && Date.now() - cacheTime < CACHE_DURATION) {
    return cached;
  }

  // Try API first (using a free public endpoint)
  try {
    // Using a CORS proxy to access Yahoo Finance search (free, no API key needed)
    // Alternative: You can replace this with Finnhub API if you have an API key
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(upperQuery)}&quotesCount=10`
    )}`;

    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const proxyData = await response.json();
      const data = JSON.parse(proxyData.contents);
      
      if (data.quotes && Array.isArray(data.quotes)) {
        const suggestions: Suggestion[] = data.quotes
          .slice(0, 10) // Limit to 10 results
          .map((item: any) => ({
            symbol: item.symbol || '',
            name: item.longname || item.shortname || item.name || '',
            exchange: item.exchange || '',
          }))
          .filter((item: Suggestion) => item.symbol && item.name);

        // Cache the results
        if (suggestions.length > 0) {
          searchCache.set(cacheKey, suggestions);
          cacheTimestamps.set(cacheKey, Date.now());
          return suggestions;
        }
      }
    }
  } catch (error) {
    console.warn('Stock search API error:', error);
    // Silently fall through to static list
  }

  // Fallback to static list filtering
  const filtered = POPULAR_STOCKS.filter(
    stock =>
      stock.symbol.toUpperCase().includes(upperQuery) ||
      stock.name.toUpperCase().includes(upperQuery)
  ).slice(0, 10);

  // Cache fallback results too
  if (filtered.length > 0) {
    searchCache.set(cacheKey, filtered);
    cacheTimestamps.set(cacheKey, Date.now());
  }

  return filtered;
};

/**
 * Debounce function to limit API calls
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
};

