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

