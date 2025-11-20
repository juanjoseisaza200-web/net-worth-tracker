import { AppData, Currency } from '../types';

const STORAGE_KEY = 'net-worth-tracker-data';

const defaultData: AppData = {
  expenses: [],
  incomes: [],
  recurringIncomes: [],
  stocks: [],
  crypto: [],
  fixedIncome: [],
  variableInvestments: [],
  baseCurrency: 'USD',
};

export const loadData = (): AppData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // Migrate old data to include new fields
      if (!data.incomes) {
        data.incomes = [];
      }
      if (!data.recurringIncomes) {
        data.recurringIncomes = [];
      }
      return data;
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
  return defaultData;
};

export const saveData = (data: AppData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving data:', error);
  }
};

export const updateBaseCurrency = (currency: Currency): void => {
  const data = loadData();
  data.baseCurrency = currency;
  saveData(data);
};

