/**
 * Fetch real-time stock price using Yahoo Finance API
 */
export const fetchStockPrice = async (symbol: string): Promise<number | null> => {
  try {
    // Using Yahoo Finance API via CORS proxy
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?interval=1d&range=1d`
    )}`;

    const response = await fetch(proxyUrl);
    
    if (response.ok) {
      const proxyData = await response.json();
      const data = JSON.parse(proxyData.contents);
      
      if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
        return data.chart.result[0].meta.regularMarketPrice;
      }
      
      // Fallback to previous close if regular market price not available
      if (data.chart?.result?.[0]?.meta?.previousClose) {
        return data.chart.result[0].meta.previousClose;
      }
    }
  } catch (error) {
    console.error(`Error fetching stock price for ${symbol}:`, error);
  }
  
  return null;
};

/**
 * Fetch real-time crypto price using CoinGecko API
 */
export const fetchCryptoPrice = async (symbol: string): Promise<number | null> => {
  try {
    // CoinGecko uses lowercase symbol IDs, we need to map common symbols
    const symbolMap: Record<string, string> = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      'SOL': 'solana',
      'XRP': 'ripple',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'DOT': 'polkadot',
      'MATIC': 'matic-network',
      'AVAX': 'avalanche-2',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'LTC': 'litecoin',
      'ATOM': 'cosmos',
      'ETC': 'ethereum-classic',
      'XLM': 'stellar',
      'ALGO': 'algorand',
      'VET': 'vechain',
      'ICP': 'internet-computer',
      'FIL': 'filecoin',
      'TRX': 'tron',
      'EOS': 'eos',
      'AAVE': 'aave',
      'MKR': 'maker',
      'GRT': 'the-graph',
    };

    const coinId = symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
    );

    if (response.ok) {
      const data = await response.json();
      
      // Try to find the price in the response
      if (data[coinId]?.usd) {
        return data[coinId].usd;
      }
      
      // If direct lookup failed, try searching
      if (!symbolMap[symbol.toUpperCase()]) {
        const searchResponse = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`
        );
        
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.coins && searchData.coins.length > 0) {
            const coinId = searchData.coins[0].id;
            const priceResponse = await fetch(
              `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
            );
            
            if (priceResponse.ok) {
              const priceData = await priceResponse.json();
              if (priceData[coinId]?.usd) {
                return priceData[coinId].usd;
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error fetching crypto price for ${symbol}:`, error);
  }
  
  return null;
};

/**
 * Fetch prices for multiple stocks
 */
export const fetchStockPrices = async (symbols: string[]): Promise<Record<string, number>> => {
  const prices: Record<string, number> = {};
  
  // Fetch prices in parallel with a delay to avoid rate limiting
  const promises = symbols.map(async (symbol, index) => {
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, index * 100));
    const price = await fetchStockPrice(symbol);
    if (price !== null) {
      prices[symbol] = price;
    }
  });
  
  await Promise.all(promises);
  return prices;
};

/**
 * Fetch prices for multiple cryptocurrencies
 */
export const fetchCryptoPrices = async (symbols: string[]): Promise<Record<string, number>> => {
  const prices: Record<string, number> = {};
  
  // Fetch prices in parallel with a delay to avoid rate limiting
  const promises = symbols.map(async (symbol, index) => {
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, index * 100));
    const price = await fetchCryptoPrice(symbol);
    if (price !== null) {
      prices[symbol] = price;
    }
  });
  
  await Promise.all(promises);
  return prices;
};

