export type Currency = 'USD' | 'COP';

export type AccountType = 'checking' | 'savings' | 'cash' | 'credit' | 'other';

export interface Account {
  id: string;
  name: string;
  /**
   * For `credit` accounts this is the outstanding debt expressed as a negative
   * number (a card you owe 500k on has a balance of -500000), so the existing
   * net-worth/transfer maths subtract it without special-casing.
   */
  balance: number;
  currency: Currency;
  type: AccountType;
  /** `credit` only: day of the month the statement closes (1-28). */
  statementDay?: number;
  /**
   * `credit` only: YYYY-MM-DD the current statement is due. Set by hand each
   * cycle — issuers shift it around weekends/holidays, so it isn't derivable
   * from `statementDay`.
   */
  paymentDueDate?: string;
  /**
   * How automatic capture recognises this account: last four digits from bank
   * SMS (card or account number) and card names as shown in Apple Wallet.
   */
  matchKeys?: string[];
}

/**
 * Set on expenses created from an Apple Pay capture so the bank SMS for the
 * same purchase can be paired with it (one SMS per expense) and dropped.
 */
export interface CaptureInfo {
  via: 'applepay';
  /** ISO timestamp of the tap. */
  at: string;
  /** Inbox item id of the SMS that was paired with this expense. */
  pairedItemId?: string;
}

export interface Expense {
  id: string;
  amount: number;
  currency: Currency;
  description: string;
  category: string;
  date: string;
  accountId: string;
  capture?: CaptureInfo;
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
  /** Where the shares are held (e.g. "Hapi"); unset = unassigned. */
  broker?: string;
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
  interestRate: number; // effective annual rate (%), e.g. 9.3
  maturityDate?: string;
  currency: Currency;
  linkedAccountId?: string;
  lastAccruedDate?: string; // YYYY-MM-DD: last day daily interest was accrued into `amount`
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
  /** Omitted on a `cardPayment` someone else paid — no account of ours moved. */
  sourceAccountId?: string;
  destinationAccountId?: string;
  type: 'automation' | 'manual' | 'cardPayment';
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
    /** Secret id of `inboxes/{key}`, where the iPhone shortcuts drop captures. */
    inboxKey?: string;
  };
}

