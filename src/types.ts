export type Currency = 'USD' | 'COP' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD';

export interface Expense {
  id: string;
  amount: number;
  currency: Currency;
  description: string;
  category: string;
  date: string;
}

export interface Income {
  id: string;
  amount: number;
  currency: Currency;
  description: string;
  category: string;
  date: string;
}

export interface RecurringIncome {
  id: string;
  amount: number;
  currency: Currency;
  description: string;
  category: string;
  dayOfMonth: number; // 1-31, the day of the month when income is received
  isActive: boolean;
}

export interface Stock {
  id: string;
  symbol: string;
  shares: number;
  purchasePrice: number;
  currentPrice?: number;
  currency: Currency;
}

export interface Crypto {
  id: string;
  symbol: string;
  amount: number;
  purchasePrice: number;
  currentPrice?: number;
  currency: Currency;
}

export interface FixedIncome {
  id: string;
  name: string;
  amount: number;
  interestRate: number;
  maturityDate?: string;
  currency: Currency;
}

export interface VariableInvestment {
  id: string;
  name: string;
  amount: number;
  currentValue?: number;
  currency: Currency;
  type: 'other';
}

export interface AppData {
  expenses: Expense[];
  incomes: Income[];
  recurringIncomes: RecurringIncome[];
  stocks: Stock[];
  crypto: Crypto[];
  fixedIncome: FixedIncome[];
  variableInvestments: VariableInvestment[];
  baseCurrency: Currency;
  settings?: {
    autoUpdatePrices: boolean;
  };
}

