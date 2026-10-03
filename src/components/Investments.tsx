import { useState, useEffect, useRef, ReactNode } from 'react';
import { Plus, Trash2, TrendingUp, Building2, LineChart as LineChartIcon, Bitcoin, Percent, Circle, CheckCircle2 } from 'lucide-react';
import { AppData, Stock, Crypto, FixedIncome, Currency } from '../types';
import { formatCurrency, formatCompactCurrency, convertCurrency } from '../utils/currency';

import AutocompleteInput, { Suggestion } from './AutocompleteInput';
import { searchStockSymbols } from '../utils/stockSearch';
import { searchCryptoSymbols } from '../utils/cryptoSearch';
import { fetchStockPrices, fetchCryptoPrices, fetchStockPrice, fetchCryptoPrice } from '../utils/priceFetcher';
import { parseAmount } from '../utils/number';
import { applyPrices } from '../utils/sync';
import { groupStocksByBroker, brokerKey, assignBroker } from '../utils/calculations';
import CurrencySelect from './CurrencySelect';
import { Section, Row, IconSquare, PageTitle, Segmented } from './ios';
import { ios } from './iosStyles';

interface InvestmentsProps {
  data: AppData;
  setData: (data: AppData) => void;
  saveLocalData: (data: AppData) => void;
  /** Each tab (Stocks / Crypto / Fixed) is shown in its own remembered currency. */
  currencyFor: (tab: InvestmentType) => Currency;
  onCurrencyChange: (tab: InvestmentType, currency: Currency) => void;
}

type InvestmentType = 'stock' | 'crypto' | 'fixed';

const TABS: { value: InvestmentType; label: string }[] = [
  { value: 'stock', label: 'Stocks' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'fixed', label: 'Fixed' },
];

// The form's two-way input-mode toggles keep their own buttons (each carries
// conversion logic), styled to match the Segmented control in ios.tsx.
const segmentTrack = 'flex p-[2px] rounded-[9px] bg-ios-fill';
const segmentButton = (active: boolean) =>
  `flex-1 min-h-[30px] px-2 rounded-[7px] text-ios-footnote font-semibold text-ios-label transition-colors ${active ? 'bg-ios-segment shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]' : ''}`;

/** Small tinted capsule next to a holding's name (e.g. "grows daily"). */
const badge = 'inline-block align-middle px-2 py-px rounded-full bg-ios-fill text-ios-caption font-normal';

export default function Investments({ data, setData, saveLocalData, currencyFor, onCurrencyChange }: InvestmentsProps) {
  const [activeTab, setActiveTab] = useState<InvestmentType>('stock');
  const baseCurrency = currencyFor(activeTab);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: InvestmentType; id: string } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Rows are tapped far down the list, but the edit form renders above it:
  // bring the form into view whenever an item is opened for editing.
  useEffect(() => {
    if (editingItem) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingItem]);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceUpdateTime, setPriceUpdateTime] = useState<Date | null>(null);

  // Pull-to-Refresh State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef(0);
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
    broker: '',
  });
  // Stocks tab: show one broker (its brokerKey) or all of them (null).
  const [brokerFilter, setBrokerFilter] = useState<string | null>(null);
  const brokerGroups = groupStocksByBroker(data.stocks, baseCurrency);
  const hasBrokers = brokerGroups.some(g => g.broker);
  // A broker whose last stock was deleted or moved falls back to "All".
  const filteredGroup = brokerFilter === null ? undefined : brokerGroups.find(g => brokerKey(g.broker) === brokerFilter);
  const activeBroker = filteredGroup ? brokerFilter : null;
  const visibleStocks = activeBroker === null ? data.stocks : data.stocks.filter(s => brokerKey(s.broker) === activeBroker);

  // Select mode: tick several stocks and file them under one broker at once.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBroker, setBulkBroker] = useState('');
  const exitSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
    setBulkBroker('');
  };
  const toggleSelected = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  // Brokers already in use, as tap-to-fill chips under a broker field.
  const renderBrokerChoices = (value: string, onPick: (broker: string) => void) => {
    const names = brokerGroups.map(g => g.broker).filter(Boolean);
    if (names.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {names.map(name => (
          <button
            key={brokerKey(name)}
            type="button"
            onClick={() => onPick(name)}
            className={`min-h-[30px] px-3 rounded-full text-ios-footnote font-semibold ${brokerKey(value) === brokerKey(name) ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-label'}`}
          >
            {name}
          </button>
        ))}
      </div>
    );
  };
  const handleAssignBroker = () => {
    setData({ ...data, stocks: assignBroker(data.stocks, selectedIds, bulkBroker) });
    exitSelecting();
  };

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
    currency: 'COP' as Currency,
    linkedAccountId: '',
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
    setStockForm({ symbol: '', shares: '', purchasePrice: '', currentPrice: '', currency: 'USD', inputMode: 'shares', moneyAmount: '', broker: '' });
    setCryptoForm({ symbol: '', amount: '', purchasePrice: '', currentPrice: '', currency: 'USD', inputMode: 'coins', moneyAmount: '' });
    setFixedForm({ name: '', amount: '', interestRate: '', maturityDate: '', currency: 'COP', linkedAccountId: '' });
    setEditingItem(null);
    setShowForm(false);
  };

  const handleStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const purchasePrice = parseAmount(stockForm.purchasePrice);
    if (purchasePrice === null || purchasePrice <= 0) {
      alert('Please enter a valid purchase price greater than 0.');
      return;
    }

    // Derive shares from the money amount when in "money" mode, else read directly.
    let shares: number;
    if (stockForm.inputMode === 'money' && stockForm.moneyAmount) {
      const moneyAmount = parseAmount(stockForm.moneyAmount);
      if (moneyAmount === null || moneyAmount <= 0) {
        alert('Please enter a valid amount greater than 0.');
        return;
      }
      // 8 decimal places to preserve exact monetary value
      shares = Math.round((moneyAmount / purchasePrice) * 100000000) / 100000000;
    } else {
      const parsedShares = parseAmount(stockForm.shares);
      if (parsedShares === null || parsedShares <= 0) {
        alert('Please enter a valid number of shares greater than 0.');
        return;
      }
      shares = Math.round(parsedShares * 100000000) / 100000000;
    }

    const currentPrice = parseAmount(stockForm.currentPrice);
    const broker = stockForm.broker.trim();

    if (editingItem && editingItem.type === 'stock') {
      const updatedList = data.stocks.map(s => {
        if (s.id === editingItem.id) {
          const updated: Stock = {
            ...s,
            symbol: stockForm.symbol.toUpperCase(),
            shares: shares,
            purchasePrice: purchasePrice,
            currency: stockForm.currency,
          };
          if (currentPrice !== null) {
            updated.currentPrice = currentPrice;
          } else {
            delete updated.currentPrice;
          }
          if (broker) {
            updated.broker = broker;
          } else {
            delete updated.broker;
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
      if (currentPrice !== null) {
        newStock.currentPrice = currentPrice;
      }
      if (broker) {
        newStock.broker = broker;
      }
      setData({ ...data, stocks: [...data.stocks, newStock] });
    }
    resetForms();
  };

  const handleCryptoSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const purchasePrice = parseAmount(cryptoForm.purchasePrice);
    if (purchasePrice === null || purchasePrice <= 0) {
      alert('Please enter a valid purchase price greater than 0.');
      return;
    }

    // Derive coin amount from the money amount when in "money" mode, else read directly.
    let amount: number;
    if (cryptoForm.inputMode === 'money' && cryptoForm.moneyAmount) {
      const moneyAmount = parseAmount(cryptoForm.moneyAmount);
      if (moneyAmount === null || moneyAmount <= 0) {
        alert('Please enter a valid amount greater than 0.');
        return;
      }
      amount = Math.round((moneyAmount / purchasePrice) * 100000000) / 100000000;
    } else {
      const parsedAmount = parseAmount(cryptoForm.amount);
      if (parsedAmount === null || parsedAmount <= 0) {
        alert('Please enter a valid amount greater than 0.');
        return;
      }
      amount = Math.round(parsedAmount * 100000000) / 100000000;
    }

    const currentPrice = parseAmount(cryptoForm.currentPrice);

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
          if (currentPrice !== null) {
            updated.currentPrice = currentPrice;
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
      if (currentPrice !== null) {
        newCrypto.currentPrice = currentPrice;
      }
      setData({ ...data, crypto: [...data.crypto, newCrypto] });
    }
    resetForms();
  };

  const handleFixedSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // If linked, we can set fake static names/amounts since it reads dynamically from the account
    const isLinked = !!fixedForm.linkedAccountId;
    const name = isLinked ? 'Linked Account' : fixedForm.name;

    // Linked entries read their value from the account, so the amount is 0 by design.
    let amount = 0;
    if (!isLinked) {
      const parsedAmount = parseAmount(fixedForm.amount);
      if (parsedAmount === null || parsedAmount <= 0) {
        alert('Please enter a valid amount greater than 0.');
        return;
      }
      amount = parsedAmount;
    }

    const interestRate = parseAmount(fixedForm.interestRate) ?? 0;

    // Reset the daily-interest clock to today: the amount entered is the value as of now.
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (editingItem && editingItem.type === 'fixed') {
      const updatedList = data.fixedIncome.map(f => {
        if (f.id === editingItem.id) {
          const updated: FixedIncome = {
            ...f,
            name: name,
            amount: amount,
            interestRate,
            currency: fixedForm.currency,
            lastAccruedDate: todayKey,
          };
          if (fixedForm.maturityDate) {
            updated.maturityDate = fixedForm.maturityDate;
          } else {
            delete updated.maturityDate; // Remove if empty to avoid undefined
          }
          if (isLinked) {
            updated.linkedAccountId = fixedForm.linkedAccountId;
          } else {
            delete updated.linkedAccountId;
          }
          return updated;
        }
        return f;
      });
      setData({ ...data, fixedIncome: updatedList });
    } else {
      const newFixed: FixedIncome = {
        id: Date.now().toString(),
        name: name,
        amount: amount,
        interestRate,
        currency: fixedForm.currency,
        lastAccruedDate: todayKey,
      };
      if (fixedForm.maturityDate) {
        newFixed.maturityDate = fixedForm.maturityDate;
      }
      if (isLinked) {
        newFixed.linkedAccountId = fixedForm.linkedAccountId;
      }
      setData({ ...data, fixedIncome: [...data.fixedIncome, newFixed] });
    }
    resetForms();
  };

  const handleEdit = (type: InvestmentType, item: Stock | Crypto | FixedIncome) => {
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
        broker: s.broker ?? '',
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
    } else {
      const f = item as FixedIncome;
      setFixedForm({
        name: f.name,
        amount: f.amount.toString(),
        interestRate: f.interestRate.toString(),
        maturityDate: f.maturityDate || '',
        currency: f.currency,
        linkedAccountId: f.linkedAccountId || '',
      });
    }
  };

  const handleDelete = (type: InvestmentType, id: string) => {
    if (confirm('Are you sure you want to delete this investment?')) {
      if (type === 'stock') {
        setData({ ...data, stocks: data.stocks.filter(s => s.id !== id) });
      } else if (type === 'crypto') {
        setData({ ...data, crypto: data.crypto.filter(c => c.id !== id) });
      } else {
        setData({ ...data, fixedIncome: data.fixedIncome.filter(f => f.id !== id) });
      }
    }
  };

  // Latest data, read when prices come back (see refreshPrices).
  const dataRef = useRef(data);
  dataRef.current = data;

  // Reusable refresh logic
  const refreshPrices = async (isManual = false) => {
    if (data.stocks.length === 0 && data.crypto.length === 0) return;

    if (isManual) setIsRefreshing(true);

    try {
      const stockPrices = data.stocks.length > 0 ? await fetchStockPrices(data.stocks.map(s => s.symbol)) : {};
      const cryptoPrices = data.crypto.length > 0 ? await fetchCryptoPrices(data.crypto.map(c => c.symbol)) : {};

      // The fetches take seconds: apply the prices to the data as it is NOW,
      // not to the copy from when they started — otherwise anything saved in
      // the meantime (an expense, a capture, a new holding) would be reverted.
      const latest = dataRef.current;
      const updatedData = applyPrices(latest, stockPrices, cryptoPrices);

      if (updatedData !== latest) {
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

  // Keep a ref to the latest refreshPrices so the interval always calls the
  // current version (with fresh data) without re-creating the interval whenever
  // prices change. The old effect depended on data.stocks/data.crypto, which it
  // then mutated via saveLocalData — that tore down and re-armed the interval on
  // every price update and fired an extra immediate fetch each time.
  const refreshPricesRef = useRef(refreshPrices);
  refreshPricesRef.current = refreshPrices;

  const autoUpdatePrices = data.settings?.autoUpdatePrices ?? true;

  // Auto-refresh prices every 60 seconds. Re-armed only when the auto-update
  // toggle changes — not when prices refresh.
  useEffect(() => {
    let isCurrent = true;

    const autoRefresh = async () => {
      if (document.hidden) return;
      if (!autoUpdatePrices) return;
      if (isCurrent) await refreshPricesRef.current(false);
    };

    // Initial fetch
    autoRefresh();

    const intervalId = setInterval(autoRefresh, 60000);

    return () => {
      isCurrent = false;
      clearInterval(intervalId);
    };
  }, [autoUpdatePrices]);

  // Touch Handlers for Pull-to-Refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only track if we are at the top of the page
    if (window.scrollY === 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pullStartY.current > 0 && window.scrollY === 0) {
      const currentY = e.touches[0].clientY;
      const diff = currentY - pullStartY.current;

      // Add a deadzone of 15px to ensure we really mean to pull
      if (diff > 15) {
        // Add resistance to the pull
        setPullDistance(Math.min((diff - 15) * 0.5, 120));
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > PULL_THRESHOLD) {
      refreshPrices(true); // Trigger manual refresh
    }
    pullStartY.current = 0;
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
      <div className={`mt-1.5 px-1 text-ios-footnote font-semibold tabular-nums ${isPositive ? 'text-ios-green' : 'text-ios-red'} flex items-center gap-1 flex-wrap`}>
        {isPositive ? <TrendingUp size={14} /> : <TrendingUp size={14} className="transform rotate-180" />}
        <span>
          {isPositive ? '+' : ''}{formatCurrency(pnl, stockForm.currency)} ({isPositive ? '+' : ''}{pnlPercent.toFixed(2)}%)
        </span>
        <span className="text-ios-secondary font-normal">
          (Est. Value: {formatCurrency(value, stockForm.currency)})
        </span>
      </div>
    );
  };

  const renderForm = () => {
    if (!showForm) return null;

    if (activeTab === 'stock') {
      return (
        <div className={`${ios.card} p-4`}>
          <h2 className="text-ios-title3 font-semibold mb-4 px-1">
            {editingItem ? 'Edit Stock' : 'Add Stock'}
          </h2>
          <form onSubmit={handleStockSubmit} className="space-y-4">
            <div>
              <label className={ios.label}>Symbol</label>
              <AutocompleteInput
                value={stockForm.symbol}
                onChange={(value) => setStockForm({ ...stockForm, symbol: value })}
                onSelect={handleStockSelect}
                placeholder="Search for stock symbol (e.g., AAPL)"
                fetchSuggestions={searchStockSymbols}
                minChars={1}
              />
            </div>
            <div>
              <label className={ios.label}>Broker (optional)</label>
              <input
                type="text"
                value={stockForm.broker}
                onChange={(e) => setStockForm({ ...stockForm, broker: e.target.value })}
                className={ios.input}
                placeholder="e.g., Hapi, Interactive Brokers"
              />
              {renderBrokerChoices(stockForm.broker, (b) => setStockForm({ ...stockForm, broker: b }))}
            </div>
            {/* Input Mode Toggle */}
            <div>
              <label className={ios.label}>Input Method</label>
              <div className={segmentTrack}>
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
                  className={segmentButton(stockForm.inputMode === 'shares')}
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
                  className={segmentButton(stockForm.inputMode === 'money')}
                >
                  By Money Amount
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {stockForm.inputMode === 'shares' ? (
                <div>
                  <label className={ios.label}>Shares</label>
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
                    className={ios.input}
                    placeholder="0.4"
                  />
                </div>
              ) : (
                <div>
                  <label className={ios.label}>Money Amount</label>
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
                    className={ios.input}
                    placeholder="30.00"
                  />
                  {stockForm.moneyAmount && stockForm.purchasePrice && parseFloat(stockForm.purchasePrice) > 0 && (
                    <div className={`${ios.hint} tabular-nums`}>
                      ≈ {(Math.round((parseFloat(stockForm.moneyAmount) / parseFloat(stockForm.purchasePrice)) * 100) / 100).toFixed(2)} shares
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className={ios.label}>Currency</label>
                <CurrencySelect
                  value={stockForm.currency}
                  onChange={(c) => setStockForm({ ...stockForm, currency: c })}
                  className={ios.select}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ios.label}>
                  Purchase Price {stockForm.inputMode === 'money' && <span className="text-ios-caption2 text-ios-tertiary">(required for calculation)</span>}
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
                  className={ios.input}
                  placeholder="Price per share"
                />
              </div>
              <div>
                <label className={`${ios.label} flex justify-between gap-1`}>
                  <span>Current Price (optional)</span>
                  {isFetchingPrice && <span className="text-ios-blue animate-pulse text-ios-caption2">Fetching price...</span>}
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
                  className={ios.input}
                />
                {renderEstimatedPnL(stockForm.shares, stockForm.purchasePrice, stockForm.currentPrice)}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" className={`${ios.buttonPrimary} flex-1`}>
                {editingItem ? 'Save' : 'Add'}
              </button>
              <button type="button" onClick={resetForms} className={`${ios.buttonSecondary} flex-1`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (activeTab === 'crypto') {
      return (
        <div className={`${ios.card} p-4`}>
          <h2 className="text-ios-title3 font-semibold mb-4 px-1">
            {editingItem ? 'Edit Crypto' : 'Add Crypto'}
          </h2>
          <form onSubmit={handleCryptoSubmit} className="space-y-4">
            <div>
              <label className={ios.label}>Symbol</label>
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
              <label className={ios.label}>Input Method</label>
              <div className={segmentTrack}>
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
                  className={segmentButton(cryptoForm.inputMode === 'coins')}
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
                  className={segmentButton(cryptoForm.inputMode === 'money')}
                >
                  By Money Amount
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {cryptoForm.inputMode === 'coins' ? (
                <div>
                  <label className={ios.label}>Amount (Coins)</label>
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
                    className={ios.input}
                    placeholder="0.5"
                  />
                </div>
              ) : (
                <div>
                  <label className={ios.label}>Money Amount</label>
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
                    className={ios.input}
                    placeholder="30.00"
                  />
                  {cryptoForm.moneyAmount && cryptoForm.purchasePrice && parseFloat(cryptoForm.purchasePrice) > 0 && (
                    <div className={`${ios.hint} tabular-nums`}>
                      ≈ {(Math.round((parseFloat(cryptoForm.moneyAmount) / parseFloat(cryptoForm.purchasePrice)) * 100000000) / 100000000).toFixed(8)} coins
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className={ios.label}>Currency</label>
                <CurrencySelect
                  value={cryptoForm.currency}
                  onChange={(c) => setCryptoForm({ ...cryptoForm, currency: c })}
                  className={ios.select}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ios.label}>
                  Purchase Price {cryptoForm.inputMode === 'money' && <span className="text-ios-caption2 text-ios-tertiary">(required for calculation)</span>}
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
                  className={ios.input}
                  placeholder="Price per coin"
                />
              </div>
              <div>
                <label className={`${ios.label} flex justify-between gap-1`}>
                  <span>Current Price (optional)</span>
                  {isFetchingPrice && <span className="text-ios-blue animate-pulse text-ios-caption2">Fetching price...</span>}
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
                  className={ios.input}
                />
                {renderEstimatedPnL(cryptoForm.amount, cryptoForm.purchasePrice, cryptoForm.currentPrice)}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" className={`${ios.buttonPrimary} flex-1`}>
                {editingItem ? 'Save' : 'Add'}
              </button>
              <button type="button" onClick={resetForms} className={`${ios.buttonSecondary} flex-1`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (activeTab === 'fixed') {
      return (
        <div className={`${ios.card} p-4`}>
          <h2 className="text-ios-title3 font-semibold mb-4 px-1">
            {editingItem ? 'Edit Fixed Income' : 'Add Fixed Income'}
          </h2>
          <form onSubmit={handleFixedSubmit} className="space-y-4">
            <div>
              <label className={ios.label}>Link to Cash Account (Optional)</label>
              <select
                value={fixedForm.linkedAccountId}
                onChange={(e) => setFixedForm({ ...fixedForm, linkedAccountId: e.target.value })}
                className={ios.select}
              >
                <option value="">No link (Manual Entry)</option>
                {data.accounts?.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance, acc.currency)})</option>
                ))}
              </select>
              <p className={ios.hint}>If linked, the balance will automatically mirror your cash account.</p>
            </div>
            {!fixedForm.linkedAccountId && (
              <>
                <div>
                  <label className={ios.label}>Name</label>
                  <input
                    type="text"
                    required
                    value={fixedForm.name}
                    onChange={(e) => setFixedForm({ ...fixedForm, name: e.target.value })}
                    className={ios.input}
                    placeholder="Savings Account, Bond, etc."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={ios.label}>Amount</label>
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
                      className={ios.input}
                    />
                  </div>
                  <div>
                    <label className={ios.label}>Currency</label>
                    <CurrencySelect
                      value={fixedForm.currency}
                      onChange={(c) => setFixedForm({ ...fixedForm, currency: c })}
                      className={ios.select}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ios.label}>Interest Rate (%)</label>
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
                  className={ios.input}
                />
              </div>
              <div>
                <label className={ios.label}>Maturity Date (optional)</label>
                <input
                  type="date"
                  value={fixedForm.maturityDate}
                  onChange={(e) => setFixedForm({ ...fixedForm, maturityDate: e.target.value })}
                  className={ios.input}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" className={`${ios.buttonPrimary} flex-1`}>
                {editingItem ? 'Save' : 'Add'}
              </button>
              <button type="button" onClick={resetForms} className={`${ios.buttonSecondary} flex-1`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    return null;
  };

  // Delete control at the trailing edge of every holding row (tapping the row edits).
  const rowActions = (type: InvestmentType, item: Stock | Crypto | FixedIncome) => (
    <div className="flex items-center gap-2 shrink-0 ml-1">
      <button onClick={() => handleDelete(type, item.id)} className={ios.rowActionDestructive} aria-label="Delete">
        <Trash2 size={18} />
      </button>
    </div>
  );

  // Headline for the active tab: label, big rounded total, and a detail line.
  const renderSummary = (label: string, icon: typeof LineChartIcon, color: string, total: number, detail: ReactNode) => (
    <div className="px-1">
      <div className="flex items-center gap-2 text-ios-subhead font-semibold text-ios-secondary">
        <IconSquare icon={icon} color={color} />
        {label}
      </div>
      <div className="mt-2 font-rounded text-[40px] leading-[48px] font-bold tabular-nums tracking-tight truncate">
        {formatCompactCurrency(total, baseCurrency)}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 text-ios-subhead">
        {detail}
      </div>
    </div>
  );

  return (
    <div
      className="px-4 pb-4 relative min-h-screen touch-pan-y"
      style={{ paddingTop: '1px' }}
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
          <div className="ios-material rounded-full pl-2.5 pr-3.5 py-2 shadow-lg flex items-center gap-2">
            <div className={`w-4 h-4 border-2 border-ios-blue border-t-transparent rounded-full ${isRefreshing || pullDistance > PULL_THRESHOLD ? 'animate-spin' : ''}`} />
            <span className="text-ios-footnote font-semibold text-ios-blue">
              {isRefreshing ? 'Updating Prices...' : pullDistance > PULL_THRESHOLD ? 'Release to Refresh' : 'Pull to Refresh'}
            </span>
          </div>
        </div>
      )}

      <div
        className="transition-transform duration-200 space-y-6"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        <div>
          <PageTitle title="Investments">
            <CurrencySelect
              value={baseCurrency}
              onChange={(c) => onCurrencyChange(activeTab, c)}
              aria-label="View currency"
              className={ios.pillSelect}
            />
          </PageTitle>

          {/* Tabs */}
          <Segmented
            options={TABS}
            value={activeTab}
            onChange={(id) => {
              setActiveTab(id);
              if (!showForm) setShowForm(false);
            }}
          />
        </div>

        {/* Summary */}
        {activeTab === 'stock' && visibleStocks.length > 0 && (() => {
          const totalCurrentValue = visibleStocks.reduce((sum, stock) => {
            const currentPrice = stock.currentPrice || stock.purchasePrice;
            const value = currentPrice * stock.shares;
            return sum + convertCurrency(value, stock.currency, baseCurrency);
          }, 0);
          const totalInvested = visibleStocks.reduce((sum, stock) => {
            const value = stock.purchasePrice * stock.shares;
            return sum + convertCurrency(value, stock.currency, baseCurrency);
          }, 0);
          const totalGainLoss = totalCurrentValue - totalInvested;
          const totalGainLossPercent = totalInvested > 0 ? ((totalGainLoss / totalInvested) * 100) : 0;

          const summaryLabel = filteredGroup ? `${filteredGroup.broker || 'No Broker'} Value` : 'Total Stocks Value';
          return renderSummary(summaryLabel, LineChartIcon, 'var(--ios-blue)', totalCurrentValue, (
            <>
              <span className="text-ios-secondary tabular-nums">Invested: {formatCompactCurrency(totalInvested, baseCurrency)}</span>
              <span className={`font-semibold tabular-nums shrink-0 ${totalGainLoss >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                {totalGainLoss >= 0 ? '+' : ''}{formatCompactCurrency(totalGainLoss, baseCurrency)}
                {' '}({totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%)
              </span>
            </>
          ));
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

          return renderSummary('Total Crypto Value', Bitcoin, 'var(--ios-purple)', totalCurrentValue, (
            <>
              <span className="text-ios-secondary tabular-nums">Invested: {formatCompactCurrency(totalInvested, baseCurrency)}</span>
              <span className={`font-semibold tabular-nums shrink-0 ${totalGainLoss >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                {totalGainLoss >= 0 ? '+' : ''}{formatCompactCurrency(totalGainLoss, baseCurrency)}
                {' '}({totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%)
              </span>
            </>
          ));
        })()}

        {activeTab === 'fixed' && data.fixedIncome.length > 0 && (() => {
          const totalValue = data.fixedIncome.reduce((sum, fixed) => {
            let amount = fixed.amount;
            let currency = fixed.currency;
            if (fixed.linkedAccountId) {
              const linkedAccount = data.accounts?.find(a => a.id === fixed.linkedAccountId);
              if (linkedAccount) {
                amount = linkedAccount.balance;
                currency = linkedAccount.currency;
              }
            }
            return sum + convertCurrency(amount, currency, baseCurrency);
          }, 0);

          return renderSummary('Total Fixed Income Value', Percent, 'var(--ios-green)', totalValue, (
            <span className="text-ios-secondary">
              {data.fixedIncome.length} investment{data.fixedIncome.length !== 1 ? 's' : ''}
            </span>
          ));
        })()}

        {/* Broker filter: "All" plus one chip per broker */}
        {activeTab === 'stock' && hasBrokers && (
          <div className="-mx-4 px-4 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {[{ key: null as string | null, label: 'All' }, ...brokerGroups.map(g => ({ key: brokerKey(g.broker) as string | null, label: g.broker || 'No Broker' }))].map(chip => (
              <button
                key={chip.key ?? '__all'}
                type="button"
                onClick={() => {
                  setBrokerFilter(chip.key);
                  setSelectedIds(new Set()); // never act on ticks hidden by the filter
                }}
                className={`shrink-0 min-h-[32px] px-3.5 rounded-full text-ios-subhead font-semibold transition-colors ${activeBroker === chip.key ? 'bg-ios-blue text-white' : 'bg-ios-fill text-ios-label'}`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Per-broker breakdown of the global total */}
        {activeTab === 'stock' && hasBrokers && activeBroker === null && (() => {
          const total = brokerGroups.reduce((sum, g) => sum + g.value, 0);
          return (
            <Section title="By Broker">
              {brokerGroups.map(g => (
                <Row
                  key={brokerKey(g.broker)}
                  title={<span className="font-semibold">{g.broker || 'No Broker'}</span>}
                  subtitle={`${g.count} stock${g.count !== 1 ? 's' : ''} · ${total > 0 ? ((g.value / total) * 100).toFixed(1) : '0.0'}% of total`}
                  value={<span className="font-semibold">{formatCompactCurrency(g.value, baseCurrency)}</span>}
                  detail={g.invested > 0 && (
                    <GainDetail positive={g.gain >= 0} percent={(g.gain / g.invested) * 100} amount={formatCompactCurrency(g.gain, baseCurrency)} />
                  )}
                  onClick={() => setBrokerFilter(brokerKey(g.broker))}
                />
              ))}
            </Section>
          );
        })()}

        {/* Select mode: assign one broker to the ticked stocks */}
        {activeTab === 'stock' && selecting && (
          <div className={`${ios.card} p-4 space-y-3`}>
            <div className="flex items-center justify-between px-1">
              <span className="text-ios-headline">{selectedIds.size} selected</span>
              <button
                type="button"
                onClick={() => setSelectedIds(selectedIds.size === visibleStocks.length ? new Set() : new Set(visibleStocks.map(s => s.id)))}
                className="text-ios-body text-ios-blue"
              >
                {selectedIds.size === visibleStocks.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div>
              <label className={ios.label}>Broker</label>
              <input
                type="text"
                value={bulkBroker}
                onChange={(e) => setBulkBroker(e.target.value)}
                className={ios.input}
                placeholder="Leave empty to remove the broker"
              />
              {renderBrokerChoices(bulkBroker, setBulkBroker)}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={handleAssignBroker} disabled={selectedIds.size === 0} className={`${ios.buttonPrimary} flex-1`}>
                Assign
              </button>
              <button type="button" onClick={exitSelecting} className={`${ios.buttonSecondary} flex-1`}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Add Button */}
        {!showForm && !(activeTab === 'stock' && selecting) && (
          <button
            onClick={() => {
              // Adding while viewing one broker files the new stock there.
              if (activeTab === 'stock' && filteredGroup) setStockForm(prev => ({ ...prev, broker: filteredGroup.broker }));
              setShowForm(true);
            }}
            className={`${ios.buttonPrimary} w-full`}
          >
            <Plus size={20} strokeWidth={2.5} />
            Add {activeTab === 'stock' ? 'Stock' : activeTab === 'crypto' ? 'Crypto' : 'Fixed Income'}
          </button>
        )}

        {/* Form (scroll-mt clears the sticky header when scrolled into view) */}
        <div ref={formRef} className="scroll-mt-16 empty:hidden">
          {renderForm()}
        </div>

        {/* Refresh Prices Button Removed - Now Auto-Refreshes */}

        {/* List */}
        <Section
          title={activeTab === 'stock' ? (filteredGroup ? `${filteredGroup.broker || 'No Broker'} Stocks` : 'Stocks') : activeTab === 'crypto' ? 'Crypto' : 'Fixed Income'}
          footer={priceUpdateTime && `Last updated: ${priceUpdateTime.toLocaleTimeString()}`}
          action={activeTab === 'stock' && visibleStocks.length > 0 && !showForm && (
            <button
              type="button"
              onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
              className="text-ios-subhead text-ios-blue"
            >
              {selecting ? 'Done' : 'Select'}
            </button>
          )}
        >
          {(() => {
            if (activeTab === 'stock') {
              if (visibleStocks.length === 0) {
                return <div className="p-8 text-center text-ios-secondary">No stocks added yet</div>;
              }
              return (
                <>
                  {[...visibleStocks]
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
                      const convertedGainLoss = convertCurrency(gainLoss, stock.currency, baseCurrency);
                      const hasCurrent = stock.currentPrice && stock.currentPrice !== stock.purchasePrice;

                      return (
                        <Row
                          key={stock.id}
                          title={<span className="font-semibold">{stock.symbol}</span>}
                          subtitle={
                            <>
                              <div className="truncate tabular-nums">
                                {stock.shares.toFixed(2)} sh @ {formatCurrency(stock.purchasePrice, stock.currency)}
                              </div>
                              {activeBroker === null && stock.broker && (
                                <div className="truncate">{stock.broker}</div>
                              )}
                              {hasCurrent && (
                                <div className="truncate tabular-nums">
                                  Now {formatCurrency(stock.currentPrice!, stock.currency)}
                                </div>
                              )}
                            </>
                          }
                          value={<span className="font-semibold">{formatCompactCurrency(convertedCurrentValue, baseCurrency)}</span>}
                          detail={hasCurrent && (
                            <GainDetail positive={gainLoss >= 0} percent={gainLossPercent} amount={formatCompactCurrency(convertedGainLoss, baseCurrency)} />
                          )}
                          onClick={() => (selecting ? toggleSelected(stock.id) : handleEdit('stock', stock))}
                          accessory={selecting ? (
                            <span className="shrink-0 ml-1" aria-hidden>
                              {selectedIds.has(stock.id)
                                ? <CheckCircle2 size={22} className="text-ios-blue" />
                                : <Circle size={22} className="text-ios-tertiary" />}
                            </span>
                          ) : rowActions('stock', stock)}
                        />
                      );
                    })}
                </>
              );
            }

            if (activeTab === 'crypto') {
              if (data.crypto.length === 0) {
                return <div className="p-8 text-center text-ios-secondary">No crypto added yet</div>;
              }
              return (
                <>
                  {data.crypto.map(crypto => {
                    const currentPrice = crypto.currentPrice || crypto.purchasePrice;
                    const currentValue = currentPrice * crypto.amount;
                    const purchaseValue = crypto.purchasePrice * crypto.amount;
                    const gainLoss = currentValue - purchaseValue;
                    const gainLossPercent = ((gainLoss / purchaseValue) * 100);

                    const convertedCurrentValue = convertCurrency(currentValue, crypto.currency, baseCurrency);
                    const convertedGainLoss = convertCurrency(gainLoss, crypto.currency, baseCurrency);
                    const hasCurrent = crypto.currentPrice && crypto.currentPrice !== crypto.purchasePrice;

                    return (
                      <Row
                        key={crypto.id}
                        title={<span className="font-semibold">{crypto.symbol}</span>}
                        subtitle={
                          <>
                            <div className="truncate tabular-nums">
                              {crypto.amount.toFixed(8)} @ {formatCurrency(crypto.purchasePrice, crypto.currency)}
                            </div>
                            {hasCurrent && (
                              <div className="truncate tabular-nums">
                                Now {formatCurrency(crypto.currentPrice!, crypto.currency)}
                              </div>
                            )}
                          </>
                        }
                        value={<span className="font-semibold">{formatCompactCurrency(convertedCurrentValue, baseCurrency)}</span>}
                        detail={hasCurrent && (
                          <GainDetail positive={gainLoss >= 0} percent={gainLossPercent} amount={formatCompactCurrency(convertedGainLoss, baseCurrency)} />
                        )}
                        onClick={() => handleEdit('crypto', crypto)}
                          accessory={rowActions('crypto', crypto)}
                      />
                    );
                  })}
                </>
              );
            }

            if (activeTab === 'fixed') {
              if (data.fixedIncome.length === 0) {
                return <div className="p-8 text-center text-ios-secondary">No fixed income investments added yet</div>;
              }
              return (
                <>
                  {data.fixedIncome.map(fixed => {
                    let amount = fixed.amount;
                    let currency = fixed.currency;
                    let name = fixed.name;
                    const isLinked = !!fixed.linkedAccountId;

                    if (isLinked) {
                      const linkedAccount = data.accounts?.find(a => a.id === fixed.linkedAccountId);
                      if (linkedAccount) {
                        amount = linkedAccount.balance;
                        currency = linkedAccount.currency;
                        name = linkedAccount.name;
                      } else {
                        name = "Disconnected Linked Account";
                      }
                    }

                    const convertedValue = convertCurrency(amount, currency, baseCurrency);
                    return (
                      <Row
                        key={fixed.id}
                        icon={isLinked ? <IconSquare icon={Building2} color="var(--ios-blue)" /> : undefined}
                        title={
                          <span className="font-semibold">
                            {name} {isLinked && <span className={badge + ' text-ios-blue'}>Linked to Cash Acct</span>}
                          </span>
                        }
                        subtitle={
                          <>
                            <div className="truncate">
                              Interest Rate: {fixed.interestRate}% EA
                              {fixed.interestRate > 0 && (
                                <span className={badge + ' ml-1.5 text-ios-green'}>grows daily</span>
                              )}
                            </div>
                            {fixed.maturityDate && (
                              <div className="truncate">
                                Maturity: {new Date(fixed.maturityDate).toLocaleDateString()}
                              </div>
                            )}
                          </>
                        }
                        value={<span className="font-semibold">{formatCompactCurrency(convertedValue, baseCurrency)}</span>}
                        onClick={() => handleEdit('fixed', fixed)}
                          accessory={rowActions('fixed', fixed)}
                      />
                    );
                  })}
                </>
              );
            }

            return null;
          })()}
        </Section>
      </div>
    </div>
  );
}

/** Stocks-app style gain/loss pill. */
// Apple Stocks style: percent in a filled pill, the amount underneath.
function GainDetail({ positive, percent, amount }: { positive: boolean; percent: number; amount: string }) {
  return (
    <span className="flex flex-col items-end">
      <span className={`inline-block mt-0.5 px-1.5 py-px rounded-md text-ios-footnote font-semibold tabular-nums text-white ${positive ? 'bg-ios-green' : 'bg-ios-red'}`}>
        {positive ? '+' : ''}{percent.toFixed(2)}%
      </span>
      <span className={`text-ios-caption tabular-nums ${positive ? 'text-ios-green' : 'text-ios-red'}`}>
        {positive ? '+' : ''}{amount}
      </span>
    </span>
  );
}
