import { Suggestion } from '../components/AutocompleteInput';

export type CryptoSuggestion = Suggestion;

// Popular cryptocurrencies list as fallback when API is unavailable
const POPULAR_CRYPTO: CryptoSuggestion[] = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'BNB', name: 'Binance Coin' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'Ripple' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'MATIC', name: 'Polygon' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINK', name: 'Chainlink' },
  { symbol: 'UNI', name: 'Uniswap' },
  { symbol: 'LTC', name: 'Litecoin' },
  { symbol: 'ATOM', name: 'Cosmos' },
  { symbol: 'ETC', name: 'Ethereum Classic' },
  { symbol: 'XLM', name: 'Stellar' },
  { symbol: 'ALGO', name: 'Algorand' },
  { symbol: 'VET', name: 'VeChain' },
  { symbol: 'ICP', name: 'Internet Computer' },
  { symbol: 'FIL', name: 'Filecoin' },
  { symbol: 'TRX', name: 'TRON' },
  { symbol: 'EOS', name: 'EOS' },
  { symbol: 'AAVE', name: 'Aave' },
  { symbol: 'MKR', name: 'Maker' },
  { symbol: 'GRT', name: 'The Graph' },
];

// Cache for API responses
const searchCache = new Map<string, CryptoSuggestion[]>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Search for cryptocurrency symbols using CoinGecko API (free, no API key required)
 * Falls back to static list if API fails
 */
export const searchCryptoSymbols = async (query: string): Promise<Suggestion[]> => {
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

  // Try API first (CoinGecko free tier)
  try {
    // Using CoinGecko's search endpoint (free, no API key required)
    const response = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`
    );

    if (response.ok) {
      const data = await response.json();
      
      if (data.coins && Array.isArray(data.coins)) {
        const suggestions: Suggestion[] = data.coins
          .slice(0, 10) // Limit to 10 results
          .map((item: any) => ({
            symbol: (item.symbol || '').toUpperCase(),
            name: item.name || '',
            marketCap: item.market_cap_rank || undefined,
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
    console.warn('Crypto search API error:', error);
    // Silently fall through to static list
  }

  // Fallback to static list filtering
  const filtered = POPULAR_CRYPTO.filter(
    crypto =>
      crypto.symbol.toUpperCase().includes(upperQuery) ||
      crypto.name.toUpperCase().includes(upperQuery)
  ).slice(0, 10);

  // Cache fallback results too
  if (filtered.length > 0) {
    searchCache.set(cacheKey, filtered);
    cacheTimestamps.set(cacheKey, Date.now());
  }

  return filtered;
};

