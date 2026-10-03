import { AppData, Currency, Account } from '../types';
import { calculateTotalExpenses, calculateTotalIncome, roundAccountBalances } from './calculations';
import { sanitizeCurrency } from './currency';

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

export const migrateData = (data: any): AppData => {
  // Backfill every array the calculators dereference unconditionally
  // (calculateNetWorth etc. do data.stocks.forEach(...) with no guard), so a
  // partial/legacy/imported doc can't crash on a missing field.
  if (!data.incomes) data.incomes = [];
  if (!data.recurringIncomes) data.recurringIncomes = [];
  if (!data.expenses) data.expenses = [];
  if (!data.debts) data.debts = [];
  if (!data.netWorthHistory) data.netWorthHistory = [];
  if (!data.stocks) data.stocks = [];
  if (!data.crypto) data.crypto = [];
  if (!data.fixedIncome) data.fixedIncome = [];
  if (!data.variableInvestments) data.variableInvestments = [];

  // Sanitize currencies before anything reads them (baseCurrency is used to
  // build the default account below, and convertCurrency runs on every record).
  data.baseCurrency = sanitizeCurrency(data.baseCurrency);
  const currencyBearingArrays = [
    'accounts', 'expenses', 'incomes', 'recurringIncomes', 'stocks',
    'crypto', 'fixedIncome', 'variableInvestments', 'debts', 'activityLogs',
    'netWorthHistory',
  ];
  currencyBearingArrays.forEach(key => {
    if (Array.isArray(data[key])) {
      data[key].forEach((item: any) => {
        if (item && 'currency' in item) item.currency = sanitizeCurrency(item.currency);
      });
    }
  });

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

  // Drop float noise left in balances by past currency conversions.
  return roundAccountBalances(data as AppData);
};

import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';
import { sanitizeInboxItem, InboxItem } from './inbox';
import { classifySnapshot, SnapshotKind } from './sync';
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

export interface SnapshotInfo {
  /** 'cached' = possibly stale local copy; 'server' = confirmed by the server. */
  kind: Exclude<SnapshotKind, 'wait'>;
  /** Server data with no local writes still pending: what is really saved. */
  confirmed: boolean;
}

export const subscribeToData = (userId: string, onDataChange: (data: AppData, info: SnapshotInfo) => void): () => void => {
  const docRef = doc(db, "users", userId);
  // includeMetadataChanges: with the persistent cache the first snapshot comes
  // from IndexedDB, and if the server then has identical data no new snapshot
  // would fire — the app could never tell that it is in sync.
  const unsubscribe = onSnapshot(docRef, { includeMetadataChanges: true }, (docSnap) => {
    const kind = classifySnapshot({ exists: docSnap.exists(), fromCache: docSnap.metadata.fromCache });
    // No cached document says nothing about the server; keep loading instead
    // of showing a brand-new (empty) user whose first save would wipe the doc.
    if (kind === 'wait') return;
    // A missing doc confirmed by the server is a brand-new user: deliver fresh
    // defaults so the app finishes loading and the first save creates the doc.
    const data = docSnap.exists() ? docSnap.data() : {};
    onDataChange(migrateData(data), { kind, confirmed: kind === 'server' && !docSnap.metadata.hasPendingWrites });
  }, (error) => {
    console.error("Error subscribing to data:", error);
  });
  return unsubscribe;
};

// --- Automatic capture inbox -------------------------------------------------
// `inboxes/{key}` records which user owns the key; the shortcuts append to
// `inboxes/{key}/items` through the Firestore REST API. See firestore.rules.

/** 64 hex chars: long enough that the key itself is the credential. */
export const generateInboxKey = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');

export const registerInboxKey = async (key: string, userId: string): Promise<void> => {
  await setDoc(doc(db, 'inboxes', key), { uid: userId });
};

export const unregisterInboxKey = async (key: string): Promise<void> => {
  await deleteDoc(doc(db, 'inboxes', key));
};

export const subscribeToInbox = (key: string, onItems: (items: InboxItem[]) => void): () => void =>
  onSnapshot(collection(db, 'inboxes', key, 'items'), (snap) => {
    // Shortcuts can send anything; one malformed item must not crash the app.
    onItems(snap.docs
      .map(d => sanitizeInboxItem(d.id, d.data()))
      .filter((item): item is InboxItem => item !== null));
  }, (error) => {
    console.error('Error subscribing to inbox:', error);
  });

export const deleteInboxItem = async (key: string, itemId: string): Promise<void> => {
  await deleteDoc(doc(db, 'inboxes', key, 'items', itemId));
};

export const updateBaseCurrency = (currency: Currency): void => {
  const data = loadData();
  data.baseCurrency = currency;
  saveData(data);
};
