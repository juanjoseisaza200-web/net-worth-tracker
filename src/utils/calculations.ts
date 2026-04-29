import { AppData, Currency } from '../types';
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

  // Calculate recurring income for the period
  if (period === 'month') {
    // For monthly, count active recurring incomes ONLY if the pay date has occurred
    const currentDay = now.getDate();
    data.recurringIncomes.forEach(recurring => {
      // Only count if active AND the pay day has passed or is today
      // This makes "Net Monthly" reflect actual cash flow so far
      if (recurring.isActive && recurring.dayOfMonth <= currentDay) {
        total += convertCurrency(recurring.amount, recurring.currency, targetCurrency);
      }
    });
  } else if (period === 'year') {
    // For yearly, count active recurring incomes 12 times
    data.recurringIncomes.forEach(recurring => {
      if (recurring.isActive) {
        total += convertCurrency(recurring.amount, recurring.currency, targetCurrency) * 12;
      }
    });
  } else {
    // For all time, calculate based on when recurring income started
    // For simplicity, we'll just count active ones once
    data.recurringIncomes.forEach(recurring => {
      if (recurring.isActive) {
        total += convertCurrency(recurring.amount, recurring.currency, targetCurrency);
      }
    });
  }

  return total;
};

