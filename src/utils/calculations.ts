import { AppData, Currency, Expense, Stock } from '../types';
import { convertCurrency } from './currency';

export const calculateNetWorth = (data: AppData, targetCurrency: Currency): number => {
  let total = 0;

  // Calculate accounts value (Cash)
  if (data.accounts) {
    data.accounts.forEach(acc => {
      total += convertCurrency(acc.balance, acc.currency, targetCurrency);
    });
  }

  // Calculate stocks value
  data.stocks.forEach(stock => {
    const value = (stock.currentPrice || stock.purchasePrice) * stock.shares;
    total += convertCurrency(value, stock.currency, targetCurrency);
  });

  // Calculate crypto value
  data.crypto.forEach(crypto => {
    const value = (crypto.currentPrice || crypto.purchasePrice) * crypto.amount;
    total += convertCurrency(value, crypto.currency, targetCurrency);
  });

  // Calculate fixed income value
  data.fixedIncome.forEach(fixed => {
    if (!fixed.linkedAccountId) {
      total += convertCurrency(fixed.amount, fixed.currency, targetCurrency);
    }
  });

  // Calculate variable investments value
  data.variableInvestments.forEach(inv => {
    const value = inv.currentValue || inv.amount;
    total += convertCurrency(value, inv.currency, targetCurrency);
  });

  // Subtract expenses (optional: you might want to track expenses separately)
  // For net worth, we typically don't subtract expenses, but you could track
  // monthly expenses separately if needed

  return total;
};

/**
 * Return a copy of `data` with today's net-worth snapshot recorded in
 * `netWorthHistory`. Keyed by local YYYY-MM-DD and deduped per day (the day's
 * entry is overwritten with the latest value), so history grows at most one
 * point per day. The value is stored in the current baseCurrency.
 */
export const recordNetWorthSnapshot = (data: AppData): AppData => {
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const entry = {
    date: dateKey,
    value: calculateNetWorth(data, data.baseCurrency),
    currency: data.baseCurrency,
  };

  const history = data.netWorthHistory ? [...data.netWorthHistory] : [];
  const existingIdx = history.findIndex(h => h.date === dateKey);
  if (existingIdx >= 0) {
    history[existingIdx] = entry;
  } else {
    history.push(entry);
  }

  return { ...data, netWorthHistory: history };
};

/**
 * Everything owed, as a positive number in `targetCurrency`. Today that's only
 * credit cards (stored as negative account balances); `debts` is deliberately
 * excluded, since that tab tracks informal IOUs outside of net worth.
 */
export const calculateTotalLiabilities = (data: AppData, targetCurrency: Currency): number => {
  if (!data.accounts) return 0;

  return data.accounts
    .filter(acc => acc.type === 'credit' && acc.balance < 0)
    .reduce((sum, acc) => {
      const value = convertCurrency(-acc.balance, acc.currency, targetCurrency);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
};

export const calculateCurrencyExposure = (data: AppData, targetCurrency: Currency) => {
  const exposureMap: Partial<Record<Currency, number>> = {};

  const addExposure = (currency: Currency, nativeAmount: number) => {
    if (!exposureMap[currency]) exposureMap[currency] = 0;
    exposureMap[currency]! += nativeAmount;
  };

  if (data.accounts) {
    // Credit cards carry a negative balance (debt), which would eat into the
    // exposure of whatever currency they're in. Exposure is about assets held.
    data.accounts.filter(acc => acc.type !== 'credit').forEach(acc => addExposure(acc.currency, acc.balance));
  }
  data.stocks.forEach(stock => addExposure(stock.currency, (stock.currentPrice || stock.purchasePrice) * stock.shares));
  data.crypto.forEach(crypto => addExposure(crypto.currency, (crypto.currentPrice || crypto.purchasePrice) * crypto.amount));
  data.fixedIncome.forEach(fixed => {
    if (!fixed.linkedAccountId) {
      addExposure(fixed.currency, fixed.amount);
    }
  });
  data.variableInvestments.forEach(inv => addExposure(inv.currency, inv.currentValue || inv.amount));

  // Share of the assets listed here — not of net worth, which also
  // subtracts card debt and would push the shares above 100%.
  const totalAssets = Object.keys(exposureMap).reduce(
    (sum, cur) => sum + convertCurrency(exposureMap[cur as Currency]!, cur as Currency, targetCurrency),
    0,
  );
  if (totalAssets <= 0) return [];

  const exposureList = Object.keys(exposureMap).map(cur => {
    const currency = cur as Currency;
    const nativeValue = exposureMap[currency]!;
    const convertedValue = convertCurrency(nativeValue, currency, targetCurrency);
    const percentage = (convertedValue / totalAssets) * 100;
    return {
      currency,
      nativeValue,
      convertedValue,
      percentage
    };
  });

  return exposureList.sort((a, b) => b.percentage - a.percentage);
};

export interface CategoryBreakdownEntry {
  category: string;
  value: number;
  percentage: number;
}

/**
 * Total spending per expense category, converted to `targetCurrency`, sorted by
 * value descending. `percentage` is each category's share of the total.
 */
export const calculateCategoryBreakdown = (
  expenses: Expense[],
  targetCurrency: Currency
): CategoryBreakdownEntry[] => {
  const totals: Record<string, number> = {};
  expenses.forEach(exp => {
    const value = convertCurrency(exp.amount, exp.currency, targetCurrency);
    // Skip corrupt values so NaN/Infinity never reaches the chart.
    if (!Number.isFinite(value) || value <= 0) return;
    totals[exp.category] = (totals[exp.category] || 0) + value;
  });

  const grandTotal = Object.values(totals).reduce((sum, v) => sum + v, 0);
  if (grandTotal === 0) return [];

  return Object.entries(totals)
    .map(([category, value]) => ({
      category,
      value,
      percentage: (value / grandTotal) * 100,
    }))
    .sort((a, b) => b.value - a.value);
};

export interface AssetAllocation {
  type: string;
  value: number;
  percentage: number;
  color: string;
}

export const calculateAssetAllocation = (data: AppData, targetCurrency: Currency): AssetAllocation[] => {
  let cash = 0;
  let stocks = 0;
  let crypto = 0;
  let fixedIncome = 0;
  let variable = 0;

  if (data.accounts) {
    // Credit cards are a liability, not an allocation of assets — including
    // them here would subtract debt from the Cash slice. See
    // calculateTotalLiabilities for the other side of the balance sheet.
    data.accounts
      .filter(acc => acc.type !== 'credit')
      .forEach(acc => cash += convertCurrency(acc.balance, acc.currency, targetCurrency));
  }
  data.stocks.forEach(s => stocks += convertCurrency((s.currentPrice || s.purchasePrice) * s.shares, s.currency, targetCurrency));
  data.crypto.forEach(c => crypto += convertCurrency((c.currentPrice || c.purchasePrice) * c.amount, c.currency, targetCurrency));
  data.fixedIncome.forEach(f => {
    if (!f.linkedAccountId) {
      fixedIncome += convertCurrency(f.amount, f.currency, targetCurrency);
    }
  });
  data.variableInvestments.forEach(v => variable += convertCurrency(v.currentValue || v.amount, v.currency, targetCurrency));

  const total = cash + stocks + crypto + fixedIncome + variable;
  if (total === 0) return [];

  const raw = [
    { type: 'Cash', value: cash, percentage: (cash / total) * 100, color: 'bg-green-500' },
    { type: 'Stocks', value: stocks, percentage: (stocks / total) * 100, color: 'bg-blue-500' },
    { type: 'Crypto', value: crypto, percentage: (crypto / total) * 100, color: 'bg-purple-500' },
    { type: 'Fixed Income', value: fixedIncome, percentage: (fixedIncome / total) * 100, color: 'bg-orange-500' },
    { type: 'Other', value: variable, percentage: (variable / total) * 100, color: 'bg-gray-500' },
  ];

  return raw.filter(a => a.value > 0).sort((a, b) => b.value - a.value);
};

export interface BrokerGroup {
  /** Display name ('' = stocks with no broker set). */
  broker: string;
  value: number;
  invested: number;
  gain: number;
  count: number;
}

/** Same broker regardless of case or stray spaces ("hapi " = "Hapi"). */
export const brokerKey = (broker?: string) => (broker ?? '').trim().toLowerCase();

/** Stock holdings totalled per broker, largest value first. */
export const groupStocksByBroker = (stocks: Stock[], targetCurrency: Currency): BrokerGroup[] => {
  const groups = new Map<string, BrokerGroup>();
  stocks.forEach(s => {
    const key = brokerKey(s.broker);
    const group = groups.get(key) ?? { broker: (s.broker ?? '').trim(), value: 0, invested: 0, gain: 0, count: 0 };
    group.value += convertCurrency((s.currentPrice || s.purchasePrice) * s.shares, s.currency, targetCurrency);
    group.invested += convertCurrency(s.purchasePrice * s.shares, s.currency, targetCurrency);
    group.gain = group.value - group.invested;
    group.count += 1;
    groups.set(key, group);
  });
  return [...groups.values()].sort((a, b) => b.value - a.value);
};

/** Files the stocks in `ids` under `broker`; a blank name clears it. */
export const assignBroker = (stocks: Stock[], ids: Set<string>, broker: string): Stock[] => {
  const name = broker.trim();
  return stocks.map(s => {
    if (!ids.has(s.id)) return s;
    const next = { ...s };
    if (name) next.broker = name;
    else delete next.broker;
    return next;
  });
};

export type HoldingSortKey = 'value' | 'pnl' | 'pnlPercent' | 'name';

/**
 * Stocks or crypto ordered for display. `unitsOf` reads shares/coins; value
 * and P&L amount are compared in `targetCurrency` so mixed currencies rank
 * correctly. Returns a new array.
 */
export const sortHoldings = <T extends { symbol: string; purchasePrice: number; currentPrice?: number; currency: Currency }>(
  holdings: T[],
  unitsOf: (h: T) => number,
  key: HoldingSortKey,
  dir: 'asc' | 'desc',
  targetCurrency: Currency,
): T[] => {
  const metric = (h: T): number => {
    const units = unitsOf(h);
    const value = (h.currentPrice || h.purchasePrice) * units;
    const cost = h.purchasePrice * units;
    if (key === 'value') return convertCurrency(value, h.currency, targetCurrency);
    if (key === 'pnl') return convertCurrency(value - cost, h.currency, targetCurrency);
    return cost > 0 ? (value - cost) / cost : 0;
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...holdings].sort((a, b) =>
    sign * (key === 'name'
      ? a.symbol.localeCompare(b.symbol, undefined, { sensitivity: 'base' })
      : metric(a) - metric(b)));
};

export const calculateTotalExpenses = (data: AppData, targetCurrency: Currency, period?: 'month' | 'year'): number => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const expenses = data.expenses.filter(expense => {
    if (!period) return true;

    // Parse YYYY-MM-DD directly to avoid timezone issues
    const [yearStr, monthStr] = expense.date.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1; // 0-indexed month

    if (period === 'month') {
      return year === currentYear && month === currentMonth;
    } else {
      return year === currentYear;
    }
  });

  return expenses.reduce((sum, expense) => {
    return sum + convertCurrency(expense.amount, expense.currency, targetCurrency);
  }, 0);
};

export const calculateTotalIncome = (data: AppData, targetCurrency: Currency, period?: 'month' | 'year'): number => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  let total = 0;

  // Calculate one-time income
  const incomes = data.incomes.filter(income => {
    if (!period) return true;

    // Parse YYYY-MM-DD directly to avoid timezone issues
    const [yearStr, monthStr] = income.date.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1; // 0-indexed month

    if (period === 'month') {
      return year === currentYear && month === currentMonth;
    } else {
      return year === currentYear;
    }
  });

  total += incomes.reduce((sum, income) => {
    return sum + convertCurrency(income.amount, income.currency, targetCurrency);
  }, 0);

  return total;
};

/**
 * Round every account balance to cents. Currency conversions leave float noise
 * (a balance of 14054342.661916541) that shows up when editing an account and
 * keeps accumulating. Returns the same object when nothing needs rounding.
 */
export const roundAccountBalances = (data: AppData): AppData => {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (!data.accounts?.some(a => a.balance !== round(a.balance))) return data;
  return { ...data, accounts: data.accounts.map(a => ({ ...a, balance: round(a.balance) })) };
};
