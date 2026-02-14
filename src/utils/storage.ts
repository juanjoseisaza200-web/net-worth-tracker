import { AppData, Currency } from '../types';
import { fetchStockPrices, fetchCryptoPrices } from './priceFetcher';

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
  settings: {
    autoUpdatePrices: true,
  },
};

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const loadData = (): AppData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // Migrate old data to include new fields
      if (!data.incomes) data.incomes = [];
      if (!data.recurringIncomes) data.recurringIncomes = [];
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

export const loadDataFromCloud = async (userId: string): Promise<AppData | null> => {
  try {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as AppData;
      // Ensure fields exist
      if (!data.incomes) data.incomes = [];
      if (!data.recurringIncomes) data.recurringIncomes = [];
      return data;
    }
  } catch (error) {
    console.error("Error loading data from cloud:", error);
  }
  return null;
};

export const saveDataToCloud = async (userId: string, data: AppData): Promise<void> => {
  try {
    await setDoc(doc(db, "users", userId), data);
  } catch (error) {
    console.error("Error saving data to cloud:", error);
  }
};

export const subscribeToData = (userId: string, onDataChange: (data: AppData) => void): () => void => {
  const docRef = doc(db, "users", userId);
  const unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data() as AppData;
      // Ensure fields exist
      if (!data.incomes) data.incomes = [];
      if (!data.recurringIncomes) data.recurringIncomes = [];
      onDataChange(data);
    }
  }, (error) => {
    console.error("Error subscribing to data:", error);
  });
  return unsubscribe;
};

export const updateBaseCurrency = (currency: Currency): void => {
  const data = loadData();
  data.baseCurrency = currency;
  saveData(data);
};

export const refreshInvestmentPrices = async (userId: string): Promise<void> => {
  try {
    // 1. Fetch LATEST data from cloud (Source of Truth)
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("No data found for user");
    }

    const data = docSnap.data() as AppData;
    let hasChanges = false;

    // 2. Update Stocks
    if (data.stocks && data.stocks.length > 0) {
      const stockSymbols = data.stocks.map(s => s.symbol);
      const stockPrices = await fetchStockPrices(stockSymbols);

      data.stocks = data.stocks.map(stock => {
        if (stockPrices[stock.symbol]) {
          hasChanges = true;
          return { ...stock, currentPrice: stockPrices[stock.symbol] };
        }
        return stock;
      });
    }

    // 3. Update Crypto
    if (data.crypto && data.crypto.length > 0) {
      const cryptoSymbols = data.crypto.map(c => c.symbol);
      const cryptoPrices = await fetchCryptoPrices(cryptoSymbols);

      data.crypto = data.crypto.map(crypto => {
        if (cryptoPrices[crypto.symbol]) {
          hasChanges = true;
          return { ...crypto, currentPrice: cryptoPrices[crypto.symbol] };
        }
        return crypto;
      });
    }

    // 4. Save BACK to cloud only if we have data (and updates)
    // Even if no prices changed, we might want to save to indicate "last updated" if we tracked that field
    // But importantly, we are saving the *fresh* list with *new* prices.
    if (hasChanges) {
      await setDoc(docRef, data);
    }

  } catch (error) {
    console.error("Error refreshing investment prices:", error);
    throw error; // Re-throw to let UI know it failed
  }
};

