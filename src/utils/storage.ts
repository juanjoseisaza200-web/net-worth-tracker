import { AppData, Currency, Account } from '../types';
import { calculateTotalExpenses, calculateTotalIncome } from './calculations';

const STORAGE_KEY = 'net-worth-tracker-data';

const defaultData: AppData = {
  accounts: [],
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

const migrateData = (data: any): AppData => {
  if (!data.incomes) data.incomes = [];
  if (!data.recurringIncomes) data.recurringIncomes = [];
  if (!data.expenses) data.expenses = [];

  if (!data.accounts) {
    const defaultAccountId = 'default-checking-' + Date.now();
    const baseCurr = data.baseCurrency || 'USD';

    // Calculate historical balance
    const totalIncome = calculateTotalIncome(data as AppData, baseCurr);
    const totalExpenses = calculateTotalExpenses(data as AppData, baseCurr);
    const initialBalance = totalIncome - totalExpenses;

    const defaultAccount: Account = {
      id: defaultAccountId,
      name: 'Main Checking',
      balance: initialBalance,
      currency: baseCurr,
      type: 'checking'
    };

    data.accounts = [defaultAccount];

    // Assign historical transactions
    if (Array.isArray(data.expenses)) data.expenses.forEach((e: any) => e.accountId = defaultAccountId);
    if (Array.isArray(data.incomes)) data.incomes.forEach((i: any) => i.accountId = defaultAccountId);
    if (Array.isArray(data.recurringIncomes)) data.recurringIncomes.forEach((r: any) => r.accountId = defaultAccountId);
  }

  return data as AppData;
};

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const loadData = (): AppData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return migrateData(data);
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
      const data = docSnap.data();
      return migrateData(data);
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
    throw error; // Re-throw to allow caller to handle UI feedback
  }
};

export const subscribeToData = (userId: string, onDataChange: (data: AppData) => void): () => void => {
  const docRef = doc(db, "users", userId);
  const unsubscribe = onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      onDataChange(migrateData(data));
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
