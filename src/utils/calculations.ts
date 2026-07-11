import { AppData, Currency, Expense } from '../types';
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

export const calculateCurrencyExposure = (data: AppData, targetCurrency: Currency) => {
  const exposureMap: Partial<Record<Currency, number>> = {};

  const addExposure = (currency: Currency, nativeAmount: number) => {
    if (!exposureMap[currency]) exposureMap[currency] = 0;
    exposureMap[currency]! += nativeAmount;
  };

  if (data.accounts) {
    data.accounts.forEach(acc => addExposure(acc.currency, acc.balance));
  }
  data.stocks.forEach(stock => addExposure(stock.currency, (stock.currentPrice || stock.purchasePrice) * stock.shares));
  data.crypto.forEach(crypto => addExposure(crypto.currency, (crypto.currentPrice || crypto.purchasePrice) * crypto.amount));
  data.fixedIncome.forEach(fixed => {
    if (!fixed.linkedAccountId) {
      addExposure(fixed.currency, fixed.amount);
    }
  });
  data.variableInvestments.forEach(inv => addExposure(inv.currency, inv.currentValue || inv.amount));

  const totalNetWorth = calculateNetWorth(data, targetCurrency);
  if (totalNetWorth === 0) return [];

  const exposureList = Object.keys(exposureMap).map(cur => {
    const currency = cur as Currency;
    const nativeValue = exposureMap[currency]!;
    const convertedValue = convertCurrency(nativeValue, currency, targetCurrency);
    const percentage = (convertedValue / totalNetWorth) * 100;
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
    data.accounts.forEach(acc => cash += convertCurrency(acc.balance, acc.currency, targetCurrency));
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

