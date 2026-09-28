import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Calendar, Search, Hash, Repeat } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { AppData, Expense, Income, RecurringIncome, Currency } from '../types';
import { formatCurrency, formatCurrencyTrimmed, formatCompactCurrency, convertCurrency } from '../utils/currency';
import { calculateTotalIncome, calculateCategoryBreakdown } from '../utils/calculations';
import { expenseCategories, incomeCategories } from '../utils/categories';
import { formatDateForDisplay, getOrdinalSuffix } from '../utils/date';
import { parseAmount } from '../utils/number';
import CurrencySelect from './CurrencySelect';
import ChartErrorBoundary from './ChartErrorBoundary';
import { Section, Row, Switch, PageTitle, Segmented } from './ios';
import { ios } from './iosStyles';
import { useIosColors } from '../utils/useIosColors';

interface ExpensesProps {
  data: AppData;
  setData: (data: AppData) => void;
  baseCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

type ViewMode = 'expenses' | 'income' | 'recurring';
type ExpensePeriod = 'all' | 'month' | 'fortnight';

const PERIOD_OPTIONS: { id: ExpensePeriod; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'month', label: 'Month' },
  { id: 'fortnight', label: 'Fortnight' },
];

const PERIOD_TITLES: Record<ExpensePeriod, string> = {
  all: 'All',
  month: 'This Month',
  fortnight: 'This Fortnight',
};

// Palette for the spending-by-category chart, assigned by index. Names are
// iOS system colors: `var(--ios-<name>)` for HTML, resolved via useIosColors
// for the recharts SVG cells.
const CATEGORY_COLORS = ['blue', 'red', 'orange', 'green', 'purple', 'teal', 'gray', 'indigo'] as const;

// Primary (filled) button in green, for the income/recurring actions.
const greenButton = ios.buttonPrimary.replace('bg-ios-blue', 'bg-ios-green');

// True if a YYYY-MM-DD date falls in the selected window relative to today.
// 'fortnight' is the current half-month (days 1–15, or 16–end).
const isInPeriod = (dateStr: string, period: ExpensePeriod): boolean => {
  if (period === 'all') return true;
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  if (y !== now.getFullYear() || m - 1 !== now.getMonth()) return false;
  if (period === 'month') return true;
  return now.getDate() <= 15 ? d <= 15 : d >= 16;
};

export default function Expenses({ data, setData, baseCurrency, onCurrencyChange }: ExpensesProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('expenses');
  const [period, setPeriod] = useState<ExpensePeriod>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringIncome | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Rows are tapped far down the list, but the edit form renders above it:
  // bring the form into view whenever an entry is opened for editing.
  useEffect(() => {
    if (editingExpense || editingIncome || editingRecurring) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editingExpense, editingIncome, editingRecurring]);
  const chartColors = useIosColors();

  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    currency: 'USD' as Currency,
    description: '',
    category: 'Other',
    date: new Date().toISOString().split('T')[0],
    accountId: data.accounts?.[0]?.id || '',
  });

  const [incomeForm, setIncomeForm] = useState({
    amount: '',
    currency: 'USD' as Currency,
    description: '',
    category: 'Salary',
    date: new Date().toISOString().split('T')[0],
    accountId: data.accounts?.[0]?.id || '',
  });

  const [recurringForm, setRecurringForm] = useState({
    amount: '',
    currency: 'USD' as Currency,
    description: '',
    category: 'Salary',
    dayOfMonth: 1,
    isActive: true,
    accountId: data.accounts?.[0]?.id || '',
  });

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.accountId) return; // Require account

    const amount = parseAmount(expenseForm.amount);
    if (amount === null || amount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    let newAccounts = [...(data.accounts || [])];

    if (editingExpense) {
      newAccounts = newAccounts.map(acc => {
        let newBalance = acc.balance;
        if (acc.id === editingExpense.accountId) {
          // Refund old account
          newBalance += convertCurrency(editingExpense.amount, editingExpense.currency, acc.currency);
        }
        if (acc.id === expenseForm.accountId) {
          // Deduct new account
          newBalance -= convertCurrency(amount, expenseForm.currency, acc.currency);
        }
        return { ...acc, balance: newBalance };
      });

      setData({
        ...data,
        accounts: newAccounts,
        expenses: data.expenses.map(exp =>
          exp.id === editingExpense.id
            ? { ...expenseForm, id: exp.id, amount }
            : exp
        ),
      });
      setEditingExpense(null);
    } else {
      const newExpense: Expense = {
        id: Date.now().toString(),
        amount,
        currency: expenseForm.currency,
        description: expenseForm.description,
        category: expenseForm.category,
        date: expenseForm.date,
        accountId: expenseForm.accountId,
      };

      newAccounts = newAccounts.map(acc => {
        if (acc.id === expenseForm.accountId) {
          return { ...acc, balance: acc.balance - convertCurrency(newExpense.amount, newExpense.currency, acc.currency) };
        }
        return acc;
      });

      setData({
        ...data,
        accounts: newAccounts,
        expenses: [...data.expenses, newExpense],
      });
    }

    setExpenseForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Other',
      date: new Date().toISOString().split('T')[0],
      accountId: data.accounts?.[0]?.id || '',
    });
    setShowForm(false);
  };

  const handleIncomeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!incomeForm.accountId) return; // Require account

    const amount = parseAmount(incomeForm.amount);
    if (amount === null || amount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    let newAccounts = [...(data.accounts || [])];

    if (editingIncome) {
      newAccounts = newAccounts.map(acc => {
        let newBalance = acc.balance;
        if (acc.id === editingIncome.accountId) {
          // Refund (deduct) old account
          newBalance -= convertCurrency(editingIncome.amount, editingIncome.currency, acc.currency);
        }
        if (acc.id === incomeForm.accountId) {
          // Add to new account
          newBalance += convertCurrency(amount, incomeForm.currency, acc.currency);
        }
        return { ...acc, balance: newBalance };
      });

      setData({
        ...data,
        accounts: newAccounts,
        incomes: data.incomes.map(inc =>
          inc.id === editingIncome.id
            ? { ...incomeForm, id: inc.id, amount }
            : inc
        ),
      });
      setEditingIncome(null);
    } else {
      const newIncome: Income = {
        id: Date.now().toString(),
        amount,
        currency: incomeForm.currency,
        description: incomeForm.description,
        category: incomeForm.category,
        date: incomeForm.date,
        accountId: incomeForm.accountId,
      };

      newAccounts = newAccounts.map(acc => {
        if (acc.id === incomeForm.accountId) {
          return { ...acc, balance: acc.balance + convertCurrency(newIncome.amount, newIncome.currency, acc.currency) };
        }
        return acc;
      });

      setData({
        ...data,
        accounts: newAccounts,
        incomes: [...data.incomes, newIncome],
      });
    }

    setIncomeForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Salary',
      date: new Date().toISOString().split('T')[0],
      accountId: data.accounts?.[0]?.id || '',
    });
    setShowForm(false);
  };

  const handleRecurringSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseAmount(recurringForm.amount);
    if (amount === null || amount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }

    if (editingRecurring) {
      setData({
        ...data,
        recurringIncomes: data.recurringIncomes.map(rec =>
          rec.id === editingRecurring.id
            // Preserve lastRunMonth — recurringForm doesn't carry it, and dropping
            // it makes processAutomations re-fire the deposit (duplicate income).
            ? { ...recurringForm, id: rec.id, amount, lastRunMonth: editingRecurring.lastRunMonth }
            : rec
        ),
      });
      setEditingRecurring(null);
    } else {
      const newRecurring: RecurringIncome = {
        id: Date.now().toString(),
        amount,
        currency: recurringForm.currency,
        description: recurringForm.description,
        category: recurringForm.category,
        dayOfMonth: recurringForm.dayOfMonth,
        isActive: recurringForm.isActive,
        accountId: recurringForm.accountId,
      };
      setData({
        ...data,
        recurringIncomes: [...data.recurringIncomes, newRecurring],
      });
    }

    setRecurringForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Salary',
      dayOfMonth: 1,
      isActive: true,
      accountId: data.accounts?.[0]?.id || '',
    });
    setShowForm(false);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setExpenseForm({
      amount: expense.amount.toString(),
      currency: expense.currency,
      description: expense.description,
      category: expense.category,
      date: expense.date,
      accountId: expense.accountId,
    });
    setViewMode('expenses');
    setShowForm(true);
  };

  const handleEditIncome = (income: Income) => {
    setEditingIncome(income);
    setIncomeForm({
      amount: income.amount.toString(),
      currency: income.currency,
      description: income.description,
      category: income.category,
      date: income.date,
      accountId: income.accountId,
    });
    setViewMode('income');
    setShowForm(true);
  };

  const handleEditRecurring = (recurring: RecurringIncome) => {
    setEditingRecurring(recurring);
    setRecurringForm({
      amount: recurring.amount.toString(),
      currency: recurring.currency,
      description: recurring.description,
      category: recurring.category,
      dayOfMonth: recurring.dayOfMonth,
      isActive: recurring.isActive,
      accountId: recurring.accountId || data.accounts?.[0]?.id || '',
    });
    setViewMode('recurring');
    setShowForm(true);
  };

  const handleDeleteExpense = (id: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      const expenseToDelete = data.expenses.find(e => e.id === id);
      const newAccounts = (data.accounts || []).map(acc => {
        if (expenseToDelete && acc.id === expenseToDelete.accountId) {
          return { ...acc, balance: acc.balance + convertCurrency(expenseToDelete.amount, expenseToDelete.currency, acc.currency) };
        }
        return acc;
      });
      setData({
        ...data,
        accounts: newAccounts,
        expenses: data.expenses.filter(exp => exp.id !== id),
      });
    }
  };

  const handleDeleteIncome = (id: string) => {
    if (confirm('Are you sure you want to delete this income?')) {
      const incomeToDelete = data.incomes.find(i => i.id === id);
      const newAccounts = (data.accounts || []).map(acc => {
        if (incomeToDelete && acc.id === incomeToDelete.accountId) {
          return { ...acc, balance: acc.balance - convertCurrency(incomeToDelete.amount, incomeToDelete.currency, acc.currency) };
        }
        return acc;
      });
      setData({
        ...data,
        accounts: newAccounts,
        incomes: data.incomes.filter(inc => inc.id !== id),
      });
    }
  };

  const handleDeleteRecurring = (id: string) => {
    if (confirm('Are you sure you want to delete this recurring income?')) {
      setData({
        ...data,
        recurringIncomes: data.recurringIncomes.filter(rec => rec.id !== id),
      });
    }
  };

  const toggleRecurringActive = (id: string) => {
    setData({
      ...data,
      recurringIncomes: data.recurringIncomes.map(rec =>
        rec.id === id ? { ...rec, isActive: !rec.isActive } : rec
      ),
    });
  };

  // Base set for the chart: period + account + search (NOT category), so the
  // breakdown always shows the full category split for the window.
  const searchLower = search.trim().toLowerCase();
  const baseFiltered = data.expenses.filter(exp =>
    isInPeriod(exp.date, period) &&
    (accountFilter === 'all' || exp.accountId === accountFilter) &&
    (searchLower === '' || exp.description.toLowerCase().includes(searchLower))
  );
  // List + summary additionally honour the category filter.
  const filteredExpenses = baseFiltered.filter(exp =>
    categoryFilter === 'all' || exp.category === categoryFilter
  );
  const categoryBreakdown = calculateCategoryBreakdown(baseFiltered, baseCurrency);
  const hasActiveFilters = period !== 'all' || accountFilter !== 'all' || categoryFilter !== 'all' || searchLower !== '';

  // Resolve the human-readable name of the account a transaction came from.
  const accountNameById = (id: string) =>
    data.accounts?.find(a => a.id === id)?.name || 'Unknown account';

  const totalExpenses = filteredExpenses.reduce((sum, exp) => {
    return sum + convertCurrency(exp.amount, exp.currency, baseCurrency);
  }, 0);

  const totalIncome = calculateTotalIncome(data, baseCurrency);
  const monthlyIncome = calculateTotalIncome(data, baseCurrency, 'month');

  const resetForms = () => {
    setExpenseForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Other',
      date: new Date().toISOString().split('T')[0],
      accountId: data.accounts?.[0]?.id || '',
    });
    setIncomeForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Salary',
      date: new Date().toISOString().split('T')[0],
      accountId: data.accounts?.[0]?.id || '',
    });
    setRecurringForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Salary',
      dayOfMonth: 1,
      isActive: true,
      accountId: data.accounts?.[0]?.id || '',
    });
    setEditingExpense(null);
    setEditingIncome(null);
    setEditingRecurring(null);
    setShowForm(false);
  };

  const renderForm = () => {
    if (!showForm) return null;

    if (viewMode === 'expenses') {
      return (
        <div className={`${ios.card} p-4`}>
          <h2 className="text-ios-headline mb-4 px-1">
            {editingExpense ? 'Edit Expense' : 'Add New Expense'}
          </h2>
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div>
              <label className={ios.label}>Description</label>
              <input
                type="text"
                required
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                className={ios.input}
                placeholder="What did you spend on?"
              />
            </div>
            <div>
              <label className={ios.label}>Account</label>
              <select
                required
                value={expenseForm.accountId}
                onChange={(e) => setExpenseForm({ ...expenseForm, accountId: e.target.value })}
                className={ios.select}
              >
                <option value="" disabled>Select Account</option>
                {data.accounts?.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance, acc.currency)})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ios.label}>Amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  lang="en-US"
                  required
                  value={expenseForm.amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setExpenseForm({ ...expenseForm, amount: val });
                    }
                  }}
                  className={`${ios.input} tabular-nums`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={ios.label}>Currency</label>
                <CurrencySelect
                  value={expenseForm.currency}
                  onChange={(c) => setExpenseForm({ ...expenseForm, currency: c })}
                  className={ios.select}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ios.label}>Category</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className={ios.select}
                >
                  {expenseCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={ios.label}>Date</label>
                <input
                  type="date"
                  required
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className={ios.input}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" className={`${ios.buttonPrimary} flex-1`}>
                {editingExpense ? 'Save' : 'Add'}
              </button>
              <button type="button" onClick={resetForms} className={`${ios.buttonSecondary} flex-1`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (viewMode === 'income') {
      return (
        <div className={`${ios.card} p-4`}>
          <h2 className="text-ios-headline mb-4 px-1">
            {editingIncome ? 'Edit Income' : 'Add New Income'}
          </h2>
          <form onSubmit={handleIncomeSubmit} className="space-y-4">
            <div>
              <label className={ios.label}>Description</label>
              <input
                type="text"
                required
                value={incomeForm.description}
                onChange={(e) => setIncomeForm({ ...incomeForm, description: e.target.value })}
                className={ios.input}
                placeholder="Salary, Freelance, etc."
              />
            </div>
            <div>
              <label className={ios.label}>Account</label>
              <select
                required
                value={incomeForm.accountId}
                onChange={(e) => setIncomeForm({ ...incomeForm, accountId: e.target.value })}
                className={ios.select}
              >
                <option value="" disabled>Select Account</option>
                {data.accounts?.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance, acc.currency)})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ios.label}>Amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  lang="en-US"
                  required
                  value={incomeForm.amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setIncomeForm({ ...incomeForm, amount: val });
                    }
                  }}
                  className={`${ios.input} tabular-nums`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={ios.label}>Currency</label>
                <CurrencySelect
                  value={incomeForm.currency}
                  onChange={(c) => setIncomeForm({ ...incomeForm, currency: c })}
                  className={ios.select}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ios.label}>Category</label>
                <select
                  value={incomeForm.category}
                  onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })}
                  className={ios.select}
                >
                  {incomeCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={ios.label}>Date</label>
                <input
                  type="date"
                  required
                  value={incomeForm.date}
                  onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
                  className={ios.input}
                />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="submit" className={`${greenButton} flex-1`}>
                {editingIncome ? 'Save' : 'Add'}
              </button>
              <button type="button" onClick={resetForms} className={`${ios.buttonSecondary} flex-1`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div className={`${ios.card} p-4`}>
        <h2 className="text-ios-headline mb-4 px-1">
          {editingRecurring ? 'Edit Recurring Income' : 'Add Recurring Income'}
        </h2>
        <form onSubmit={handleRecurringSubmit} className="space-y-4">
          <div>
            <label className={ios.label}>Description</label>
            <input
              type="text"
              required
              value={recurringForm.description}
              onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })}
              className={ios.input}
              placeholder="Monthly Salary, Rent, etc."
            />
          </div>
          <div>
            <label className={ios.label}>Account</label>
            <select
              value={recurringForm.accountId}
              onChange={(e) => setRecurringForm({ ...recurringForm, accountId: e.target.value })}
              className={ios.select}
            >
              <option value="">No specific account</option>
              {data.accounts?.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance, acc.currency)})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ios.label}>Amount</label>
              <input
                type="number"
                inputMode="decimal"
                required
                step="0.01"
                min="0"
                value={recurringForm.amount}
                onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                className={`${ios.input} tabular-nums`}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={ios.label}>Currency</label>
              <CurrencySelect
                value={recurringForm.currency}
                onChange={(c) => setRecurringForm({ ...recurringForm, currency: c })}
                className={ios.select}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ios.label}>Category</label>
              <select
                value={recurringForm.category}
                onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })}
                className={ios.select}
              >
                {incomeCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${ios.label} flex items-center gap-1`}>
                Day of Month <Calendar size={13} />
              </label>
              <input
                type="number"
                required
                min="1"
                max="31"
                value={recurringForm.dayOfMonth}
                onChange={(e) => setRecurringForm({ ...recurringForm, dayOfMonth: parseInt(e.target.value) })}
                className={`${ios.input} tabular-nums`}
                placeholder="1-31"
              />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-ios-fill">
            <span className="text-ios-subhead text-ios-label">Active (will be counted in monthly income)</span>
            <input
              type="checkbox"
              checked={recurringForm.isActive}
              onChange={(e) => setRecurringForm({ ...recurringForm, isActive: e.target.checked })}
              className="w-5 h-5 shrink-0 accent-ios-green"
            />
          </label>
          <div className="flex gap-3 pt-1">
            <button type="submit" className={`${greenButton} flex-1`}>
              {editingRecurring ? 'Save' : 'Add'}
            </button>
            <button type="button" onClick={resetForms} className={`${ios.buttonSecondary} flex-1`}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  };

  const emptyState = (text: string) => (
    <div className="px-6 py-8 text-center text-ios-subhead text-ios-secondary">{text}</div>
  );

  return (
    <div className="px-4 pb-24">
      <PageTitle title="Expenses">
        <CurrencySelect
          value={baseCurrency}
          onChange={onCurrencyChange}
          aria-label="View currency"
          className={ios.pillSelect}
        />
      </PageTitle>

      <div className="space-y-6">
        {/* Tabs + filters */}
        <div className="space-y-3">
          <Segmented<ViewMode>
            options={[
              { value: 'expenses', label: 'Expenses' },
              { value: 'income', label: 'Income' },
              { value: 'recurring', label: 'Recurring' },
            ]}
            value={viewMode}
            onChange={(id) => {
              setViewMode(id);
              if (showForm && (id !== viewMode)) {
                resetForms();
              }
            }}
          />

          {/* Time period filter (expenses) */}
          {viewMode === 'expenses' && (
            <Segmented<ExpensePeriod>
              options={PERIOD_OPTIONS.map(opt => ({ value: opt.id, label: opt.label }))}
              value={period}
              onChange={setPeriod}
            />
          )}

          {/* Search + account/category filters (expenses) */}
          {viewMode === 'expenses' && (
            <>
              <div className="relative">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ios-secondary pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search expenses..."
                  className={`${ios.input} pl-9`}
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className={`${ios.select} flex-1 min-w-0 text-ios-subhead`}
                >
                  <option value="all">All accounts</option>
                  {(data.accounts || []).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={`${ios.select} flex-1 min-w-0 text-ios-subhead`}
                >
                  <option value="all">All categories</option>
                  {expenseCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Summary tiles */}
        {viewMode === 'expenses' && (
          <div className="grid grid-cols-2 gap-3">
            <div className={`${ios.card} p-4 min-w-0`}>
              <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-red">
                <TrendingDown size={16} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Total Expenses</span>
              </div>
              <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
                {formatCompactCurrency(totalExpenses, baseCurrency)}
              </div>
              {period !== 'all' && <div className="text-ios-footnote text-ios-secondary">{PERIOD_TITLES[period]}</div>}
            </div>
            <div className={`${ios.card} p-4 min-w-0`}>
              <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-secondary">
                <Hash size={16} strokeWidth={2.5} className="shrink-0" /> Count
              </div>
              <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
                {filteredExpenses.length}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'income' && (
          <div className="grid grid-cols-2 gap-3">
            <div className={`${ios.card} p-4 min-w-0`}>
              <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-green">
                <TrendingUp size={16} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Total Income</span>
              </div>
              <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
                {formatCompactCurrency(totalIncome, baseCurrency)}
              </div>
            </div>
            <div className={`${ios.card} p-4 min-w-0`}>
              <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-green">
                <Calendar size={16} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Monthly Income</span>
              </div>
              <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
                {formatCompactCurrency(monthlyIncome, baseCurrency)}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'recurring' && (
          <div className="grid grid-cols-2 gap-3">
            <div className={`${ios.card} p-4 min-w-0`}>
              <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-green">
                <Repeat size={16} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Active</span>
              </div>
              <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
                {formatCompactCurrency(
                  data.recurringIncomes
                    .filter(r => r.isActive)
                    .reduce((sum, r) => sum + convertCurrency(r.amount, r.currency, baseCurrency), 0),
                  baseCurrency
                )}
              </div>
            </div>
            <div className={`${ios.card} p-4 min-w-0`}>
              <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-secondary">
                <Hash size={16} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Total Recurring</span>
              </div>
              <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
                {data.recurringIncomes.length}
              </div>
            </div>
          </div>
        )}

        {/* Spending-by-category chart (expenses) */}
        {viewMode === 'expenses' && categoryBreakdown.length > 0 && (
          <Section title="Spending by Category">
            <div className="pt-4 px-4 pb-1">
              <ChartErrorBoundary>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categoryBreakdown} dataKey="value" nameKey="category" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">
                      {categoryBreakdown.map((entry, i) => (
                        <Cell key={entry.category} fill={chartColors[CATEGORY_COLORS[i % CATEGORY_COLORS.length]]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v), baseCurrency)}
                      contentStyle={{ background: 'var(--ios-card)', border: 'none', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', color: 'var(--ios-label)' }}
                      itemStyle={{ color: 'var(--ios-label)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartErrorBoundary>
            </div>
            {categoryBreakdown.map((entry, i) => (
              <Row
                key={entry.category}
                icon={<div className="w-2.5 h-2.5 rounded-full ml-1" style={{ backgroundColor: `var(--ios-${CATEGORY_COLORS[i % CATEGORY_COLORS.length]})` }} />}
                title={entry.category}
                value={formatCurrencyTrimmed(entry.value, baseCurrency)}
                detail={`${entry.percentage.toFixed(1)}%`}
              />
            ))}
          </Section>
        )}

        {/* Add Button */}
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              if (viewMode === 'expenses') {
                setEditingExpense(null);
              } else if (viewMode === 'income') {
                setEditingIncome(null);
              } else {
                setEditingRecurring(null);
              }
            }}
            className={`${viewMode === 'expenses' ? ios.buttonPrimary : greenButton} w-full`}
          >
            <Plus size={20} strokeWidth={2.5} />
            Add {viewMode === 'expenses' ? 'Expense' : viewMode === 'income' ? 'Income' : 'Recurring Income'}
          </button>
        )}

        {/* Form (scroll-mt clears the sticky header when scrolled into view) */}
        <div ref={formRef} className="scroll-mt-16 empty:hidden">
          {renderForm()}
        </div>

        {/* Lists */}
        {viewMode === 'expenses' && (
          <div className="space-y-6">
            <div className="flex items-baseline justify-between px-1 -mb-3">
              <h2 className="text-ios-title3 font-bold">
                {period === 'all' ? 'All Expenses' : PERIOD_TITLES[period]}
              </h2>
              {period !== 'all' && (
                <span className="text-ios-footnote text-ios-secondary tabular-nums">{filteredExpenses.length} item{filteredExpenses.length === 1 ? '' : 's'}</span>
              )}
            </div>
            {data.expenses.length === 0 ? (
              <Section>{emptyState('No expenses recorded yet. Add your first expense!')}</Section>
            ) : filteredExpenses.length === 0 ? (
              <Section>{emptyState(hasActiveFilters ? 'No expenses match these filters.' : 'No expenses recorded yet.')}</Section>
            ) : (
              (() => {
                const sortedExpenses = [...filteredExpenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                const grouped: { monthYear: string; expenses: Expense[]; total: number }[] = [];

                sortedExpenses.forEach(expense => {
                  const [year, month] = expense.date.split('-');
                  const dateObj = new Date(parseInt(year), parseInt(month) - 1);
                  const monthYear = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

                  let group = grouped.find(g => g.monthYear === monthYear);
                  if (!group) {
                    group = { monthYear, expenses: [], total: 0 };
                    grouped.push(group);
                  }
                  group.expenses.push(expense);
                  group.total += convertCurrency(expense.amount, expense.currency, baseCurrency);
                });

                return grouped.map(group => (
                  <Section
                    key={group.monthYear}
                    title={group.monthYear}
                    action={<span className="text-ios-footnote text-ios-secondary tabular-nums">{formatCurrencyTrimmed(group.total, baseCurrency)}</span>}
                  >
                    {group.expenses.map(expense => (
                      <Row
                        key={expense.id}
                        onClick={() => handleEditExpense(expense)}
                        title={expense.description}
                        subtitle={`${expense.category} · ${accountNameById(expense.accountId)}`}
                        value={<span className="text-ios-red">−{formatCurrencyTrimmed(expense.amount, expense.currency)}</span>}
                        detail={
                          expense.currency !== baseCurrency
                            ? `≈ ${formatCurrencyTrimmed(convertCurrency(expense.amount, expense.currency, baseCurrency), baseCurrency)} · ${formatDateForDisplay(expense.date)}`
                            : formatDateForDisplay(expense.date)
                        }
                        accessory={
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleDeleteExpense(expense.id)} className={ios.rowActionDestructive} aria-label="Delete expense">
                              <Trash2 size={17} />
                            </button>
                          </div>
                        }
                      />
                    ))}
                  </Section>
                ));
              })()
            )}
          </div>
        )}

        {viewMode === 'income' && (
          <div className="space-y-6">
            <h2 className="text-ios-title3 font-bold px-1 -mb-3">All Income</h2>
            {data.incomes.length === 0 ? (
              <Section>{emptyState('No income recorded yet. Add your first income!')}</Section>
            ) : (
              (() => {
                const sortedIncomes = [...data.incomes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                const grouped: { monthYear: string; incomes: Income[]; total: number }[] = [];

                sortedIncomes.forEach(income => {
                  const [year, month] = income.date.split('-');
                  const dateObj = new Date(parseInt(year), parseInt(month) - 1);
                  const monthYear = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

                  let group = grouped.find(g => g.monthYear === monthYear);
                  if (!group) {
                    group = { monthYear, incomes: [], total: 0 };
                    grouped.push(group);
                  }
                  group.incomes.push(income);
                  group.total += convertCurrency(income.amount, income.currency, baseCurrency);
                });

                return grouped.map(group => (
                  <Section
                    key={group.monthYear}
                    title={group.monthYear}
                    action={<span className="text-ios-footnote text-ios-green tabular-nums">{formatCurrencyTrimmed(group.total, baseCurrency)}</span>}
                  >
                    {group.incomes.map(income => (
                      <Row
                        key={income.id}
                        onClick={() => handleEditIncome(income)}
                        title={income.description}
                        subtitle={`${income.category} · ${accountNameById(income.accountId)}`}
                        value={<span className="text-ios-green">+{formatCurrencyTrimmed(income.amount, income.currency)}</span>}
                        detail={
                          income.currency !== baseCurrency
                            ? `≈ ${formatCurrencyTrimmed(convertCurrency(income.amount, income.currency, baseCurrency), baseCurrency)} · ${formatDateForDisplay(income.date)}`
                            : formatDateForDisplay(income.date)
                        }
                        accessory={
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleDeleteIncome(income.id)} className={ios.rowActionDestructive} aria-label="Delete income">
                              <Trash2 size={17} />
                            </button>
                          </div>
                        }
                      />
                    ))}
                  </Section>
                ));
              })()
            )}
          </div>
        )}

        {viewMode === 'recurring' && (
          <Section title="Recurring Income">
            {data.recurringIncomes.length === 0 ? (
              emptyState('No recurring income set up yet. Add your first recurring income!')
            ) : (
              data.recurringIncomes.map(recurring => {
                const convertedAmount = convertCurrency(recurring.amount, recurring.currency, baseCurrency);
                return (
                  <Row
                    key={recurring.id}
                    onClick={() => handleEditRecurring(recurring)}
                    title={<span className={recurring.isActive ? '' : 'text-ios-secondary'}>{recurring.description}</span>}
                    subtitle={
                      <>
                        <div className={`truncate tabular-nums ${recurring.isActive ? 'text-ios-green' : ''}`}>
                          {formatCurrencyTrimmed(convertedAmount, baseCurrency)}/month · {recurring.isActive ? 'Active' : 'Inactive'}
                        </div>
                        <div className="truncate">
                          {recurring.category} · Every {recurring.dayOfMonth}{getOrdinalSuffix(recurring.dayOfMonth)} of the month
                        </div>
                      </>
                    }
                    accessory={
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleDeleteRecurring(recurring.id)} className={ios.rowActionDestructive} aria-label="Delete recurring income">
                          <Trash2 size={17} />
                        </button>
                        <div className="ml-1">
                          <Switch
                            checked={recurring.isActive}
                            onChange={() => toggleRecurringActive(recurring.id)}
                            label={recurring.isActive ? 'Deactivate' : 'Activate'}
                          />
                        </div>
                      </div>
                    }
                  />
                );
              })
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
