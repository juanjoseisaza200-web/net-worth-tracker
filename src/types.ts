export type Currency = 'USD' | 'COP';

export type AccountType = 'checking' | 'savings' | 'cash' | 'other';

export interface Account {
  id: string;
  name: string;
  balance: number;
  currency: Currency;
  type: AccountType;
}

export interface Expense {
  id: string;
  amount: number;
  currency: Currency;
  description: string;
  category: string;
  date: string;
  accountId: string;
}

export interface Income {
  id: string;
  amount: number;
  currency: Currency;
  description: string;
  category: string;
  date: string;
  accountId: string;
}

export interface RecurringIncome {
  id: string;
  amount: number;
  currency: Currency;
  description: string;
  category: string;
  dayOfMonth: number; // 1-31, the day of the month when income is received
  isActive: boolean;
  accountId?: string;
  lastRunMonth?: string; // YYYY-MM format to track when it was last processed
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
  linkedAccountId?: string;
}

export interface VariableInvestment {
  id: string;
  name: string;
  amount: number;
  currentValue?: number;
  currency: Currency;
  type: 'other';
}

export interface Automation {
  id: string;
  name: string;
  type: 'sweep' | 'transfer';
  sourceAccountId: string;
  destinationAccountId: string;
  amount?: number; // Used only for 'transfer'
  keepAmount?: number; // Used only for 'sweep' (e.g., leave exactly 7,500 in Checking)
  dayOfMonth: number; // 1-28, or 0 to represent 'End of Month'
  isActive: boolean;
  lastRunMonth?: string; // Format: 'YYYY-MM'
}

export interface ActivityLog {
  id: string;
  date: string; // ISO format string
  description: string;
  amount: number;
  currency: Currency;
  sourceAccountId?: string;
  destinationAccountId?: string;
  type: 'automation' | 'manual';
}

export interface DashboardWidgetConfig {
  id: string;
  visible: boolean;
  order: number;
}

export interface Debt {
  id: string;
  type: 'payable' | 'receivable'; // payable = I owe them; receivable = They owe me
  personName: string;
  amount: number;
  currency: Currency;
  description: string;
  dueDate?: string;
}

export interface NetWorthSnapshot {
  date: string; // YYYY-MM-DD
  value: number;
  currency: Currency; // currency `value` is expressed in (the base currency at capture time)
}

export interface AppData {
  accounts: Account[];
  expenses: Expense[];
  incomes: Income[];
  recurringIncomes: RecurringIncome[];
  automations?: Automation[];
  activityLogs?: ActivityLog[];
  stocks: Stock[];
  crypto: Crypto[];
  fixedIncome: FixedIncome[];
  variableInvestments: VariableInvestment[];
  debts?: Debt[];
  netWorthHistory?: NetWorthSnapshot[];
  baseCurrency: Currency;
  settings?: {
    autoUpdatePrices: boolean;
    dashboardLayout?: DashboardWidgetConfig[];
  };
}

