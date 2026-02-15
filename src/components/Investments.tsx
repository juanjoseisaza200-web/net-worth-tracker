import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Plus, Trash2, Edit2, TrendingUp, Coins, BarChart3, DollarSign } from 'lucide-react';
import { AppData, Stock, Crypto, FixedIncome, VariableInvestment, Currency } from '../types';
import { formatCurrency, formatCompactCurrency, convertCurrency } from '../utils/currency';
import AutocompleteInput, { Suggestion } from './AutocompleteInput';
import { searchStockSymbols } from '../utils/stockSearch';
import { searchCryptoSymbols } from '../utils/cryptoSearch';
import { fetchStockPrices, fetchCryptoPrices, fetchStockPrice, fetchCryptoPrice } from '../utils/priceFetcher';

interface InvestmentsProps {
  data: AppData;
  setData: (data: AppData) => void;
  saveLocalData: (data: AppData) => void;
  baseCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
  user: User | null;
}

const currencies: Currency[] = ['USD', 'COP', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
type InvestmentType = 'stock' | 'crypto' | 'fixed' | 'variable';

export default function Investments({ data, setData, saveLocalData, baseCurrency, onCurrencyChange, user }: InvestmentsProps) {
  const [activeTab, setActiveTab] = useState<InvestmentType>('stock');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: InvestmentType; id: string } | null>(null);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceUpdateTime, setPriceUpdateTime] = useState<Date | null>(null);

  // Pull-to-Refresh State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullStartY, setPullStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const PULL_THRESHOLD = 80; // Pixels to pull down to trigger refresh

  const [stockForm, setStockForm] = useState({
    symbol: '',
    shares: '',
    purchasePrice: '',
    currentPrice: '',
    currency: 'USD' as Currency,
    inputMode: 'shares' as 'shares' | 'money',
    moneyAmount: '',
  });

  const [cryptoForm, setCryptoForm] = useState({
    symbol: '',
    amount: '',
    purchasePrice: '',
    currentPrice: '',
    currency: 'USD' as Currency,
    inputMode: 'coins' as 'coins' | 'money',
    moneyAmount: '',
  });

  const [fixedForm, setFixedForm] = useState({
    name: '',
    amount: '',
    interestRate: '',
    maturityDate: '',
    currency: 'USD' as Currency,
  });

  const [variableForm, setVariableForm] = useState({
    name: '',
    amount: '',
    currentValue: '',
    currency: 'USD' as Currency,
  });

  const handleStockSelect = async (suggestion: Suggestion) => {
    setStockForm(prev => ({ ...prev, symbol: suggestion.symbol }));
    setIsFetchingPrice(true);
    const price = await fetchStockPrice(suggestion.symbol);
    if (price) {
      setStockForm(prev => ({ ...prev, currentPrice: price.toString() }));
    }
    setIsFetchingPrice(false);
  };

  const handleCryptoSelect = async (suggestion: Suggestion) => {
    setCryptoForm(prev => ({ ...prev, symbol: suggestion.symbol }));
    setIsFetchingPrice(true);
    const price = await fetchCryptoPrice(suggestion.symbol);
    if (price) {
      setCryptoForm(prev => ({ ...prev, currentPrice: price.toString() }));
    }
    setIsFetchingPrice(false);
  };

  const resetForms = () => {
    setStockForm({ symbol: '', shares: '', purchasePrice: '', currentPrice: '', currency: 'USD', inputMode: 'shares', moneyAmount: '' });
    setCryptoForm({ symbol: '', amount: '', purchasePrice: '', currentPrice: '', currency: 'USD', inputMode: 'coins', moneyAmount: '' });
    setFixedForm({ name: '', amount: '', interestRate: '', maturityDate: '', currency: 'USD' });
    setVariableForm({ name: '', amount: '', currentValue: '', currency: 'USD' });
    setEditingItem(null);
    setShowForm(false);
  };

  const handleStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Calculate shares if in money mode
    let shares = parseFloat(stockForm.shares);
    const purchasePrice = parseFloat(stockForm.purchasePrice);

    if (stockForm.inputMode === 'money' && stockForm.moneyAmount && purchasePrice > 0) {
      const moneyAmount = parseFloat(stockForm.moneyAmount);
      // Increase precision to 8 decimal places to preserve exact monetary value
      shares = Math.round((moneyAmount / purchasePrice) * 100000000) / 100000000;
    } else {
      // Also allow higher precision for direct share input if needed, or keep it standard. 
      // Let's use 8 decimals here too to be consistent and allow fractional shares.
      shares = Math.round(shares * 100000000) / 100000000;
    }

    if (editingItem && editingItem.type === 'stock') {
      const updatedList = data.stocks.map(s => {
        if (s.id === editingItem.id) {
          const updated: Stock = {
            ...s,
            symbol: stockForm.symbol,
            shares: shares,
            purchasePrice: purchasePrice,
            currency: stockForm.currency,
          };
          if (stockForm.currentPrice) {
            updated.currentPrice = parseFloat(stockForm.currentPrice);
          } else {
            delete updated.currentPrice;
          }
          return updated;
        }
        return s;
      });
      setData({ ...data, stocks: updatedList });
    } else {
      const newStock: Stock = {
        id: Date.now().toString(),
        symbol: stockForm.symbol.toUpperCase(),
        shares: shares,
        purchasePrice: purchasePrice,
        currency: stockForm.currency,
      };
      if (stockForm.currentPrice) {
        newStock.currentPrice = parseFloat(stockForm.currentPrice);
      }
      setData({ ...data, stocks: [...data.stocks, newStock] });
    }
    resetForms();
  };

  const handleCryptoSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Calculate amount if in money mode
    let amount: number;
    const purchasePrice = parseFloat(cryptoForm.purchasePrice);

    if (cryptoForm.inputMode === 'money' && cryptoForm.moneyAmount && purchasePrice > 0) {
      const moneyAmount = parseFloat(cryptoForm.moneyAmount);
      // For crypto, preserve 8 decimal places (same as input step)
      amount = Math.round((moneyAmount / purchasePrice) * 100000000) / 100000000;
    } else {
      // Use amount from form (coins mode)
      amount = parseFloat(cryptoForm.amount) || 0;
      // Round to 8 decimal places for crypto
      amount = Math.round(amount * 100000000) / 100000000;
    }

    if (editingItem && editingItem.type === 'crypto') {
      const updatedList = data.crypto.map(c => {
        if (c.id === editingItem.id) {
          const updated: Crypto = {
            ...c,
            symbol: cryptoForm.symbol.toUpperCase(),
            amount: amount,
            purchasePrice: purchasePrice,
            currency: cryptoForm.currency,
          };
          if (cryptoForm.currentPrice) {
            updated.currentPrice = parseFloat(cryptoForm.currentPrice);
          } else {
            delete updated.currentPrice;
          }
          return updated;
        }
        return c;
      });
      setData({ ...data, crypto: updatedList });
    } else {
      const newCrypto: Crypto = {
        id: Date.now().toString(),
        symbol: cryptoForm.symbol.toUpperCase(),
        amount: amount,
        purchasePrice: purchasePrice,
        currency: cryptoForm.currency,
      };
      if (cryptoForm.currentPrice) {
        newCrypto.currentPrice = parseFloat(cryptoForm.currentPrice);
      }
      setData({ ...data, crypto: [...data.crypto, newCrypto] });
    }
    resetForms();
  };

  const handleFixedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem && editingItem.type === 'fixed') {
      const updatedList = data.fixedIncome.map(f => {
        if (f.id === editingItem.id) {
          const updated: FixedIncome = {
            ...f,
            name: fixedForm.name,
            amount: parseFloat(fixedForm.amount),
            interestRate: parseFloat(fixedForm.interestRate),
            currency: fixedForm.currency,
          };
          if (fixedForm.maturityDate) {
            updated.maturityDate = fixedForm.maturityDate;
          } else {
            delete updated.maturityDate; // Remove if empty to avoid undefined
          }
          return updated;
        }
        return f;
      });
      setData({ ...data, fixedIncome: updatedList });
    } else {
      const newFixed: FixedIncome = {
        id: Date.now().toString(),
        name: fixedForm.name,
        amount: parseFloat(fixedForm.amount),
        interestRate: parseFloat(fixedForm.interestRate),
        currency: fixedForm.currency,
      };
      if (fixedForm.maturityDate) {
        newFixed.maturityDate = fixedForm.maturityDate;
      }
      setData({ ...data, fixedIncome: [...data.fixedIncome, newFixed] });
    }
    resetForms();
  };

  const handleVariableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem && editingItem.type === 'variable') {
      const updatedList = data.variableInvestments.map(v => {
        if (v.id === editingItem.id) {
          const updated: VariableInvestment = {
            ...v,
            name: variableForm.name,
            amount: parseFloat(variableForm.amount),
            currency: variableForm.currency,
          };
          if (variableForm.currentValue) {
            updated.currentValue = parseFloat(variableForm.currentValue);
          } else {
            delete updated.currentValue;
          }
          return updated;
        }
        return v;
      });
      setData({ ...data, variableInvestments: updatedList });
    } else {
      const newVariable: VariableInvestment = {
        id: Date.now().toString(),
        name: variableForm.name,
        amount: parseFloat(variableForm.amount),
        currency: variableForm.currency,
        type: 'other',
      };
      if (variableForm.currentValue) {
        newVariable.currentValue = parseFloat(variableForm.currentValue);
      }
      setData({ ...data, variableInvestments: [...data.variableInvestments, newVariable] });
    }
    resetForms();
  };

  const handleEdit = (type: InvestmentType, item: Stock | Crypto | FixedIncome | VariableInvestment) => {
    setEditingItem({ type, id: item.id });
    setShowForm(true);
    setActiveTab(type);

    if (type === 'stock') {
      const s = item as Stock;
      setStockForm({
        symbol: s.symbol,
        shares: s.shares.toString(),
        purchasePrice: s.purchasePrice.toString(),
        currentPrice: s.currentPrice?.toString() || '',
        currency: s.currency,
        inputMode: 'shares',
        moneyAmount: (s.shares * s.purchasePrice).toFixed(2),
      });
    } else if (type === 'crypto') {
      const c = item as Crypto;
      setCryptoForm({
        symbol: c.symbol,
        amount: c.amount.toString(),
        purchasePrice: c.purchasePrice.toString(),
        currentPrice: c.currentPrice?.toString() || '',
        currency: c.currency,
        inputMode: 'coins',
        moneyAmount: (c.amount * c.purchasePrice).toFixed(2),
      });
    } else if (type === 'fixed') {
      const f = item as FixedIncome;
      setFixedForm({
        name: f.name,
        amount: f.amount.toString(),
        interestRate: f.interestRate.toString(),
        maturityDate: f.maturityDate || '',
        currency: f.currency,
      });
    } else {
      const v = item as VariableInvestment;
      setVariableForm({
        name: v.name,
        amount: v.amount.toString(),
        currentValue: v.currentValue?.toString() || '',
        currency: v.currency,
      });
    }
  };

  const handleDelete = (type: InvestmentType, id: string) => {
    if (confirm('Are you sure you want to delete this investment?')) {
      if (type === 'stock') {
        setData({ ...data, stocks: data.stocks.filter(s => s.id !== id) });
      } else if (type === 'crypto') {
        setData({ ...data, crypto: data.crypto.filter(c => c.id !== id) });
      } else if (type === 'fixed') {
        setData({ ...data, fixedIncome: data.fixedIncome.filter(f => f.id !== id) });
      } else {
        setData({ ...data, variableInvestments: data.variableInvestments.filter(v => v.id !== id) });
      }
    }
  };

  // Reusable refresh logic
  const refreshPrices = async (isManual = false) => {
    if (data.stocks.length === 0 && data.crypto.length === 0) return;

    if (isManual) setIsRefreshing(true);

    const updatedData = { ...data };
    let hasUpdates = false;

    try {
      // Fetch stock prices
      if (data.stocks.length > 0) {
        const stockSymbols = data.stocks.map(s => s.symbol);
        const stockPrices = await fetchStockPrices(stockSymbols);

        updatedData.stocks = data.stocks.map(stock => {
          if (stockPrices[stock.symbol] && stockPrices[stock.symbol] !== stock.currentPrice) {
            hasUpdates = true;
            return { ...stock, currentPrice: stockPrices[stock.symbol] };
          }
          return stock;
        });
      }

      // Fetch crypto prices
      if (data.crypto.length > 0) {
        const cryptoSymbols = data.crypto.map(c => c.symbol);
        const cryptoPrices = await fetchCryptoPrices(cryptoSymbols);

        updatedData.crypto = data.crypto.map(crypto => {
          if (cryptoPrices[crypto.symbol] && cryptoPrices[crypto.symbol] !== crypto.currentPrice) {
            hasUpdates = true;
            return { ...crypto, currentPrice: cryptoPrices[crypto.symbol] };
          }
          return crypto;
        });
      }

      if (hasUpdates) {
        // If manual refresh, save to cloud (setData). If auto, local only (saveLocalData).
        if (isManual) {
          setData(updatedData);
        } else {
          saveLocalData(updatedData);
        }
        setPriceUpdateTime(new Date());
      }
    } catch (error) {
      console.error("Error refreshing prices:", error);
    } finally {
      if (isManual) setIsRefreshing(false);
    }
  };

  // Auto-refresh prices every 60 seconds
  useEffect(() => {
    let isCurrent = true;

    const autoRefresh = async () => {
      if (document.hidden) return;
      const autoUpdate = data.settings?.autoUpdatePrices ?? true;
      if (!autoUpdate) return;

      if (isCurrent) await refreshPrices(false);
    };

    // Initial fetch
    autoRefresh();

    const intervalId = setInterval(autoRefresh, 60000);

    return () => {
      isCurrent = false;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.stocks, data.crypto, data.settings?.autoUpdatePrices]);

  // Touch Handlers for Pull-to-Refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setPullStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStartY > 0 && window.scrollY === 0) {
      const currentY = e.touches[0].clientY;
      const diff = currentY - pullStartY;
      if (diff > 0) {
        // Add resistance to the pull
        setPullDistance(Math.min(diff * 0.5, 120));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > PULL_THRESHOLD) {
      refreshPrices(true); // Trigger manual refresh
    }
    setPullStartY(0);
    setPullDistance(0);
  };

  const renderEstimatedPnL = (sharesStr: string, purchasePriceStr: string, currentPriceStr: string) => {
    const shares = parseFloat(sharesStr);
    const purchasePrice = parseFloat(purchasePriceStr);
    const currentPrice = parseFloat(currentPriceStr);

    if (!shares || !purchasePrice || !currentPrice) return null;

    const cost = shares * purchasePrice;
    const value = shares * currentPrice;
    const pnl = value - cost;
    const pnlPercent = (pnl / cost) * 100;
    const isPositive = pnl >= 0;

    return (
      <div className={`mt-2 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'} flex items-center gap-1`}>
        {isPositive ? <TrendingUp size={16} /> : <TrendingUp size={16} className="transform rotate-180" />}
        <span>
          {isPositive ? '+' : ''}{formatCurrency(pnl, stockForm.currency)} ({isPositive ? '+' : ''}{pnlPercent.toFixed(2)}%)
        </span>
        <span className="text-gray-400 font-normal ml-1">
          (Est. Value: {formatCurrency(value, stockForm.currency)})
        </span>
      </div>
    );
  };

  const renderForm = () => {
    if (!showForm) return null;

    if (activeTab === 'stock') {
      return (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-lg font-semibold mb-4">
            {editingItem ? 'Edit Stock' : 'Add Stock'}
          </h2>
          <form onSubmit={handleStockSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
              <AutocompleteInput
                value={stockForm.symbol}
                onChange={(value) => setStockForm({ ...stockForm, symbol: value })}
                onSelect={handleStockSelect}
                placeholder="Search for stock symbol (e.g., AAPL)"
                fetchSuggestions={searchStockSymbols}
                minChars={1}
              />
            </div>
            {/* Input Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Input Method</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Switch to shares mode: calculate shares from moneyAmount if possible
                    let newShares = stockForm.shares;
                    if (stockForm.moneyAmount && stockForm.purchasePrice) {
                      const money = parseFloat(stockForm.moneyAmount);
                      const price = parseFloat(stockForm.purchasePrice);
                      if (price > 0) {
                        newShares = (money / price).toFixed(2);
                      }
                    }
                    setStockForm({ ...stockForm, inputMode: 'shares', shares: newShares });
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${stockForm.inputMode === 'shares'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  By Shares
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Switch to money mode: calculate moneyAmount from shares if possible
                    let newMoneyAmount = stockForm.moneyAmount;
                    if (stockForm.shares && stockForm.purchasePrice) {
                      const shares = parseFloat(stockForm.shares);
                      const price = parseFloat(stockForm.purchasePrice);
                      if (price > 0) {
                        newMoneyAmount = (shares * price).toFixed(2);
                      }
                    }
                    setStockForm({ ...stockForm, inputMode: 'money', moneyAmount: newMoneyAmount });
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${stockForm.inputMode === 'money'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  By Money Amount
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {stockForm.inputMode === 'shares' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shares</label>
                  <input
                    type="text"
                    inputMode="decimal"

                    lang="en-US"
                    required
                    value={stockForm.shares}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setStockForm({ ...stockForm, shares: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="0.4"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Money Amount</label>
                  <input
                    type="text"
                    inputMode="decimal"

                    lang="en-US"
                    required
                    value={stockForm.moneyAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setStockForm({ ...stockForm, moneyAmount: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="30.00"
                  />
                  {stockForm.moneyAmount && stockForm.purchasePrice && parseFloat(stockForm.purchasePrice) > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      ≈ {(Math.round((parseFloat(stockForm.moneyAmount) / parseFloat(stockForm.purchasePrice)) * 100) / 100).toFixed(2)} shares
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <select
                  value={stockForm.currency}
                  onChange={(e) => setStockForm({ ...stockForm, currency: e.target.value as Currency })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purchase Price {stockForm.inputMode === 'money' && <span className="text-xs text-gray-500">(required for calculation)</span>}
                </label>
                <input
                  type="text"
                  inputMode="decimal"

                  lang="en-US"
                  required
                  value={stockForm.purchasePrice}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setStockForm({ ...stockForm, purchasePrice: val });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Price per share"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between">
                  <span>Current Price (optional)</span>
                  {isFetchingPrice && <span className="text-blue-600 animate-pulse text-xs">Fetching price...</span>}
                </label>
                <input
                  type="text"
                  inputMode="decimal"

                  lang="en-US"
                  value={stockForm.currentPrice}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setStockForm({ ...stockForm, currentPrice: val });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                {renderEstimatedPnL(stockForm.shares, stockForm.purchasePrice, stockForm.currentPrice)}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold">
                {editingItem ? 'Update' : 'Add'} Stock
              </button>
              <button type="button" onClick={resetForms} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (activeTab === 'crypto') {
      return (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-lg font-semibold mb-4">
            {editingItem ? 'Edit Crypto' : 'Add Crypto'}
          </h2>
          <form onSubmit={handleCryptoSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
              <AutocompleteInput
                value={cryptoForm.symbol}
                onChange={(value) => setCryptoForm({ ...cryptoForm, symbol: value })}
                onSelect={handleCryptoSelect}
                placeholder="Search for crypto symbol (e.g., BTC)"
                fetchSuggestions={searchCryptoSymbols}
                minChars={1}
              />
            </div>
            {/* Input Mode Toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Input Method</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Switch to coins mode: calculate amount from moneyAmount if possible
                    let newAmount = cryptoForm.amount;
                    if (cryptoForm.moneyAmount && cryptoForm.purchasePrice) {
                      const money = parseFloat(cryptoForm.moneyAmount);
                      const price = parseFloat(cryptoForm.purchasePrice);
                      if (price > 0) {
                        newAmount = (money / price).toFixed(8);
                      }
                    }
                    setCryptoForm({ ...cryptoForm, inputMode: 'coins', amount: newAmount });
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${cryptoForm.inputMode === 'coins'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  By Coins
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Switch to money mode: calculate moneyAmount from amount if possible
                    let newMoneyAmount = cryptoForm.moneyAmount;
                    if (cryptoForm.amount && cryptoForm.purchasePrice) {
                      const amt = parseFloat(cryptoForm.amount);
                      const price = parseFloat(cryptoForm.purchasePrice);
                      if (price > 0) {
                        newMoneyAmount = (amt * price).toFixed(2);
                      }
                    }
                    setCryptoForm({ ...cryptoForm, inputMode: 'money', moneyAmount: newMoneyAmount });
                  }}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${cryptoForm.inputMode === 'money'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  By Money Amount
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {cryptoForm.inputMode === 'coins' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Coins)</label>
                  <input
                    type="text"
                    inputMode="decimal"

                    lang="en-US"
                    required
                    value={cryptoForm.amount}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setCryptoForm({ ...cryptoForm, amount: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="0.5"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Money Amount</label>
                  <input
                    type="text"
                    inputMode="decimal"

                    lang="en-US"
                    required
                    value={cryptoForm.moneyAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setCryptoForm({ ...cryptoForm, moneyAmount: val });
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="30.00"
                  />
                  {cryptoForm.moneyAmount && cryptoForm.purchasePrice && parseFloat(cryptoForm.purchasePrice) > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      ≈ {(Math.round((parseFloat(cryptoForm.moneyAmount) / parseFloat(cryptoForm.purchasePrice)) * 100000000) / 100000000).toFixed(8)} coins
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <select
                  value={cryptoForm.currency}
                  onChange={(e) => setCryptoForm({ ...cryptoForm, currency: e.target.value as Currency })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purchase Price {cryptoForm.inputMode === 'money' && <span className="text-xs text-gray-500">(required for calculation)</span>}
                </label>
                <input
                  type="text"
                  inputMode="decimal"

                  lang="en-US"
                  required
                  value={cryptoForm.purchasePrice}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setCryptoForm({ ...cryptoForm, purchasePrice: val });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Price per coin"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between">
                  <span>Current Price (optional)</span>
                  {isFetchingPrice && <span className="text-blue-600 animate-pulse text-xs">Fetching price...</span>}
                </label>
                <input
                  type="text"
                  inputMode="decimal"

                  lang="en-US"
                  value={cryptoForm.currentPrice}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setCryptoForm({ ...cryptoForm, currentPrice: val });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                {renderEstimatedPnL(cryptoForm.amount, cryptoForm.purchasePrice, cryptoForm.currentPrice)}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold">
                {editingItem ? 'Update' : 'Add'} Crypto
              </button>
              <button type="button" onClick={resetForms} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (activeTab === 'fixed') {
      return (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h2 className="text-lg font-semibold mb-4">
            {editingItem ? 'Edit Fixed Income' : 'Add Fixed Income'}
          </h2>
          <form onSubmit={handleFixedSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                required
                value={fixedForm.name}
                onChange={(e) => setFixedForm({ ...fixedForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Savings Account, Bond, etc."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="text"
                  inputMode="decimal"

                  lang="en-US"
                  required
                  value={fixedForm.amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setFixedForm({ ...fixedForm, amount: val });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <select
                  value={fixedForm.currency}
                  onChange={(e) => setFixedForm({ ...fixedForm, currency: e.target.value as Currency })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interest Rate (%)</label>
                <input
                  type="text"
                  inputMode="decimal"

                  lang="en-US"
                  required
                  value={fixedForm.interestRate}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setFixedForm({ ...fixedForm, interestRate: val });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maturity Date (optional)</label>
                <input
                  type="date"
                  value={fixedForm.maturityDate}
                  onChange={(e) => setFixedForm({ ...fixedForm, maturityDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold">
                {editingItem ? 'Update' : 'Add'} Fixed Income
              </button>
              <button type="button" onClick={resetForms} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingItem ? 'Edit Variable Investment' : 'Add Variable Investment'}
        </h2>
        <form onSubmit={handleVariableSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              required
              value={variableForm.name}
              onChange={(e) => setVariableForm({ ...variableForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Real Estate, Commodities, etc."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial Amount</label>
              <input
                type="text"
                inputMode="decimal"

                lang="en-US"
                required
                value={variableForm.amount}
                onChange={(e) => {
                  const val = e.target.value.replace(',', '.');
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setVariableForm({ ...variableForm, amount: val });
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={variableForm.currency}
                onChange={(e) => setVariableForm({ ...variableForm, currency: e.target.value as Currency })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Value (optional)</label>
            <input
              type="text"
              inputMode="decimal"

              lang="en-US"
              value={variableForm.currentValue}
              onChange={(e) => {
                const val = e.target.value.replace(',', '.');
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setVariableForm({ ...variableForm, currentValue: val });
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold">
              {editingItem ? 'Update' : 'Add'} Investment
            </button>
            <button type="button" onClick={resetForms} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <div
      className="p-4 space-y-4 pb-24 relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-Refresh Indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="absolute left-0 right-0 flex justify-center items-center z-10 transition-transform duration-200"
          style={{ top: isRefreshing ? '20px' : `${Math.min(pullDistance / 2, 40)}px` }}
        >
          <div className="bg-white rounded-full p-2 shadow-md flex items-center gap-2">
            <div className={`w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full ${isRefreshing || pullDistance > PULL_THRESHOLD ? 'animate-spin' : ''}`} />
            <span className="text-xs font-medium text-blue-600">
              {isRefreshing ? 'Updating Prices...' : pullDistance > PULL_THRESHOLD ? 'Release to Refresh' : 'Pull to Refresh'}
            </span>
          </div>
        </div>
      )}

      {/* Header with Currency Selector */}
      <div
        className="bg-white rounded-lg shadow p-4 transition-transform duration-200"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Investments</h1>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Currency:</label>
            <select
              value={baseCurrency}
              onChange={(e) => onCurrencyChange(e.target.value as Currency)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium"
            >
              {currencies.map(currency => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="bg-white rounded-lg shadow overflow-hidden transition-transform duration-200"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        <div className="flex border-b border-gray-200">
          {[
            { id: 'stock' as InvestmentType, label: 'Stocks', icon: TrendingUp },
            { id: 'crypto' as InvestmentType, label: 'Crypto', icon: Coins },
            { id: 'fixed' as InvestmentType, label: 'Fixed', icon: DollarSign },
            { id: 'variable' as InvestmentType, label: 'Variable', icon: BarChart3 },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (!showForm) setShowForm(false);
                }}
                className={`flex-1 py-3 px-2 text-center flex flex-col items-center gap-1 ${activeTab === tab.id
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
                  }`}
              >
                <Icon size={20} />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg transition-transform duration-200"
          style={{ transform: `translateY(${pullDistance}px)` }}
        >
          <Plus size={20} />
          Add {activeTab === 'stock' ? 'Stock' : activeTab === 'crypto' ? 'Crypto' : activeTab === 'fixed' ? 'Fixed Income' : 'Variable Investment'}
        </button>
      )}

      {/* Form */}
      {renderForm()}

      {/* Refresh Prices Button Removed - Now Auto-Refreshes */}


      {priceUpdateTime && (
        <div className="text-xs text-gray-500 text-center">
          Last updated: {priceUpdateTime.toLocaleTimeString()}
        </div>
      )}

      {/* Summary Cards */}
      {activeTab === 'stock' && data.stocks.length > 0 && (() => {
        const totalCurrentValue = data.stocks.reduce((sum, stock) => {
          const currentPrice = stock.currentPrice || stock.purchasePrice;
          const value = currentPrice * stock.shares;
          return sum + convertCurrency(value, stock.currency, baseCurrency);
        }, 0);
        const totalInvested = data.stocks.reduce((sum, stock) => {
          const value = stock.purchasePrice * stock.shares;
          return sum + convertCurrency(value, stock.currency, baseCurrency);
        }, 0);
        const totalGainLoss = totalCurrentValue - totalInvested;
        const totalGainLossPercent = totalInvested > 0 ? ((totalGainLoss / totalInvested) * 100) : 0;

        return (
          <div
            className="bg-white rounded-lg shadow p-4 transition-transform duration-200"
            style={{ transform: `translateY(${pullDistance}px)` }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Total Stocks Value</span>
              <TrendingUp size={20} className="text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-600 mb-2">
              {formatCompactCurrency(totalCurrentValue, baseCurrency)}
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Invested: {formatCompactCurrency(totalInvested, baseCurrency)}</span>
              <span className={`font-semibold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalGainLoss >= 0 ? '+' : ''}{formatCompactCurrency(totalGainLoss, baseCurrency)}
                ({totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        );
      })()}

      {activeTab === 'crypto' && data.crypto.length > 0 && (() => {
        const totalCurrentValue = data.crypto.reduce((sum, crypto) => {
          const currentPrice = crypto.currentPrice || crypto.purchasePrice;
          const value = currentPrice * crypto.amount;
          return sum + convertCurrency(value, crypto.currency, baseCurrency);
        }, 0);
        const totalInvested = data.crypto.reduce((sum, crypto) => {
          const value = crypto.purchasePrice * crypto.amount;
          return sum + convertCurrency(value, crypto.currency, baseCurrency);
        }, 0);
        const totalGainLoss = totalCurrentValue - totalInvested;
        const totalGainLossPercent = totalInvested > 0 ? ((totalGainLoss / totalInvested) * 100) : 0;

        return (
          <div
            className="bg-white rounded-lg shadow p-4 transition-transform duration-200"
            style={{ transform: `translateY(${pullDistance}px)` }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Total Crypto Value</span>
              <Coins size={20} className="text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-purple-600 mb-2">
              {formatCompactCurrency(totalCurrentValue, baseCurrency)}
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Invested: {formatCompactCurrency(totalInvested, baseCurrency)}</span>
              <span className={`font-semibold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalGainLoss >= 0 ? '+' : ''}{formatCompactCurrency(totalGainLoss, baseCurrency)}
                ({totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        );
      })()}

      {activeTab === 'fixed' && data.fixedIncome.length > 0 && (() => {
        const totalValue = data.fixedIncome.reduce((sum, fixed) => {
          return sum + convertCurrency(fixed.amount, fixed.currency, baseCurrency);
        }, 0);

        return (
          <div
            className="bg-white rounded-lg shadow p-4 transition-transform duration-200"
            style={{ transform: `translateY(${pullDistance}px)` }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Total Fixed Income Value</span>
              <DollarSign size={20} className="text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-600">
              {formatCompactCurrency(totalValue, baseCurrency)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {data.fixedIncome.length} investment{data.fixedIncome.length !== 1 ? 's' : ''}
            </div>
          </div>
        );
      })()}

      {activeTab === 'variable' && data.variableInvestments.length > 0 && (() => {
        const totalValue = data.variableInvestments.reduce((sum, inv) => {
          const value = inv.currentValue || inv.amount;
          return sum + convertCurrency(value, inv.currency, baseCurrency);
        }, 0);

        return (
          <div
            className="bg-white rounded-lg shadow p-4 transition-transform duration-200"
            style={{ transform: `translateY(${pullDistance}px)` }}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Total Variable Investments Value</span>
              <BarChart3 size={20} className="text-yellow-500" />
            </div>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCompactCurrency(totalValue, baseCurrency)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {data.variableInvestments.length} investment{data.variableInvestments.length !== 1 ? 's' : ''}
            </div>
          </div>
        );
      })()}

      {/* List */}
      <div
        className="bg-white rounded-lg shadow transition-transform duration-200"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            {activeTab === 'stock' ? 'Stocks' : activeTab === 'crypto' ? 'Crypto' : activeTab === 'fixed' ? 'Fixed Income' : 'Variable Investments'}
          </h2>
        </div>
        {(() => {
          if (activeTab === 'stock') {
            if (data.stocks.length === 0) {
              return <div className="p-8 text-center text-gray-500">No stocks added yet</div>;
            }
            return (
              <div className="divide-y divide-gray-100">
                {[...data.stocks]
                  .sort((a, b) => {
                    const valueA = (a.currentPrice || a.purchasePrice) * a.shares;
                    const valueB = (b.currentPrice || b.purchasePrice) * b.shares;
                    // Convert to base currency for accurate comparison
                    const convertedValueA = convertCurrency(valueA, a.currency, baseCurrency);
                    const convertedValueB = convertCurrency(valueB, b.currency, baseCurrency);
                    return convertedValueB - convertedValueA; // Descending order (Highest to Lowest)
                  })
                  .map(stock => {
                    const currentPrice = stock.currentPrice || stock.purchasePrice;
                    const currentValue = currentPrice * stock.shares;
                    const purchaseValue = stock.purchasePrice * stock.shares;
                    const gainLoss = currentValue - purchaseValue;
                    const gainLossPercent = ((gainLoss / purchaseValue) * 100);

                    const convertedCurrentValue = convertCurrency(currentValue, stock.currency, baseCurrency);
                    const convertedPurchaseValue = convertCurrency(purchaseValue, stock.currency, baseCurrency);
                    const convertedGainLoss = convertCurrency(gainLoss, stock.currency, baseCurrency);

                    return (
                      <div key={stock.id} className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="font-semibold text-lg text-gray-800 truncate">{stock.symbol}</div>
                            <div className="text-sm text-gray-500 mt-1">
                              {stock.shares.toFixed(2)} shares @ {formatCurrency(stock.purchasePrice, stock.currency)}
                            </div>
                            {stock.currentPrice && stock.currentPrice !== stock.purchasePrice && (
                              <div className="text-sm text-gray-500">
                                Current: {formatCurrency(stock.currentPrice, stock.currency)}
                              </div>
                            )}
                            <div className="text-lg font-bold text-blue-600 mt-2">
                              {formatCompactCurrency(convertedCurrentValue, baseCurrency)}
                            </div>
                            {stock.currentPrice && stock.currentPrice !== stock.purchasePrice && (
                              <div className="mt-2 space-y-1">
                                <div className={`text-sm font-semibold ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {gainLoss >= 0 ? '+' : ''}{formatCompactCurrency(convertedGainLoss, baseCurrency)}
                                  ({gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%)
                                </div>
                                <div className="text-xs text-gray-500">
                                  Invested: {formatCompactCurrency(convertedPurchaseValue, baseCurrency)}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit('stock', stock)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete('stock', stock.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          }

          if (activeTab === 'crypto') {
            if (data.crypto.length === 0) {
              return <div className="p-8 text-center text-gray-500">No crypto added yet</div>;
            }
            return (
              <div className="divide-y divide-gray-100">
                {data.crypto.map(crypto => {
                  const currentPrice = crypto.currentPrice || crypto.purchasePrice;
                  const currentValue = currentPrice * crypto.amount;
                  const purchaseValue = crypto.purchasePrice * crypto.amount;
                  const gainLoss = currentValue - purchaseValue;
                  const gainLossPercent = ((gainLoss / purchaseValue) * 100);

                  const convertedCurrentValue = convertCurrency(currentValue, crypto.currency, baseCurrency);
                  const convertedPurchaseValue = convertCurrency(purchaseValue, crypto.currency, baseCurrency);
                  const convertedGainLoss = convertCurrency(gainLoss, crypto.currency, baseCurrency);

                  return (
                    <div key={crypto.id} className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="font-semibold text-lg text-gray-800 truncate">{crypto.symbol}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {crypto.amount.toFixed(8)} {crypto.symbol} @ {formatCurrency(crypto.purchasePrice, crypto.currency)}
                          </div>
                          {crypto.currentPrice && crypto.currentPrice !== crypto.purchasePrice && (
                            <div className="text-sm text-gray-500">
                              Current: {formatCurrency(crypto.currentPrice, crypto.currency)}
                            </div>
                          )}
                          <div className="text-lg font-bold text-purple-600 mt-2">
                            {formatCompactCurrency(convertedCurrentValue, baseCurrency)}
                          </div>
                          {crypto.currentPrice && crypto.currentPrice !== crypto.purchasePrice && (
                            <div className="mt-2 space-y-1">
                              <div className={`text-sm font-semibold ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {gainLoss >= 0 ? '+' : ''}{formatCompactCurrency(convertedGainLoss, baseCurrency)}
                                ({gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%)
                              </div>
                              <div className="text-xs text-gray-500">
                                Invested: {formatCompactCurrency(convertedPurchaseValue, baseCurrency)}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit('crypto', crypto)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete('crypto', crypto.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          if (activeTab === 'fixed') {
            if (data.fixedIncome.length === 0) {
              return <div className="p-8 text-center text-gray-500">No fixed income investments added yet</div>;
            }
            return (
              <div className="divide-y divide-gray-100">
                {data.fixedIncome.map(fixed => {
                  const convertedValue = convertCurrency(fixed.amount, fixed.currency, baseCurrency);
                  return (
                    <div key={fixed.id} className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="font-semibold text-lg text-gray-800 truncate">{fixed.name}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            Interest Rate: {fixed.interestRate}%
                          </div>
                          {fixed.maturityDate && (
                            <div className="text-sm text-gray-500">
                              Maturity: {new Date(fixed.maturityDate).toLocaleDateString()}
                            </div>
                          )}
                          <div className="text-lg font-bold text-green-600 mt-2">
                            {formatCompactCurrency(convertedValue, baseCurrency)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit('fixed', fixed)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete('fixed', fixed.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          if (data.variableInvestments.length === 0) {
            return <div className="p-8 text-center text-gray-500">No variable investments added yet</div>;
          }
          return (
            <div className="divide-y divide-gray-100">
              {data.variableInvestments.map(inv => {
                const value = inv.currentValue || inv.amount;
                const convertedValue = convertCurrency(value, inv.currency, baseCurrency);
                return (
                  <div key={inv.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="font-semibold text-lg text-gray-800 truncate">{inv.name}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          Initial: {formatCurrency(inv.amount, inv.currency)}
                        </div>
                        {inv.currentValue && (
                          <div className="text-sm text-gray-500">
                            Current: {formatCurrency(inv.currentValue, inv.currency)}
                          </div>
                        )}
                        <div className="text-lg font-bold text-yellow-600 mt-2">
                          {formatCompactCurrency(convertedValue, baseCurrency)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit('variable', inv)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete('variable', inv.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

