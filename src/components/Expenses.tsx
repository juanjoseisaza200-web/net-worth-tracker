import { useState } from 'react';
import { Plus, Trash2, Edit2, TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';
import { AppData, Expense, Income, RecurringIncome, Currency } from '../types';
import { formatCurrency, convertCurrency } from '../utils/currency';
import { calculateTotalIncome } from '../utils/calculations';

interface ExpensesProps {
  data: AppData;
  setData: (data: AppData) => void;
  baseCurrency: Currency;
}

const currencies: Currency[] = ['USD', 'COP', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const expenseCategories = ['Transport', 'Shopping', 'Bills', 'Entertainment', 'Healthcare', 'Other'];
const incomeCategories = ['Salary', 'Freelance', 'Investment', 'Business', 'Rental', 'Other'];
type ViewMode = 'expenses' | 'income' | 'recurring';

export default function Expenses({ data, setData, baseCurrency }: ExpensesProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('expenses');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringIncome | null>(null);
  
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    currency: 'USD' as Currency,
    description: '',
    category: 'Other',
    date: new Date().toISOString().split('T')[0],
  });

  const [incomeForm, setIncomeForm] = useState({
    amount: '',
    currency: 'USD' as Currency,
    description: '',
    category: 'Salary',
    date: new Date().toISOString().split('T')[0],
  });

  const [recurringForm, setRecurringForm] = useState({
    amount: '',
    currency: 'USD' as Currency,
    description: '',
    category: 'Salary',
    dayOfMonth: 1,
    isActive: true,
  });

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingExpense) {
      setData({
        ...data,
        expenses: data.expenses.map(exp =>
          exp.id === editingExpense.id
            ? { ...expenseForm, id: exp.id, amount: parseFloat(expenseForm.amount) }
            : exp
        ),
      });
      setEditingExpense(null);
    } else {
      const newExpense: Expense = {
        id: Date.now().toString(),
        amount: parseFloat(expenseForm.amount),
        currency: expenseForm.currency,
        description: expenseForm.description,
        category: expenseForm.category,
        date: expenseForm.date,
      };
      setData({
        ...data,
        expenses: [...data.expenses, newExpense],
      });
    }

    setExpenseForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Other',
      date: new Date().toISOString().split('T')[0],
    });
    setShowForm(false);
  };

  const handleIncomeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingIncome) {
      setData({
        ...data,
        incomes: data.incomes.map(inc =>
          inc.id === editingIncome.id
            ? { ...incomeForm, id: inc.id, amount: parseFloat(incomeForm.amount) }
            : inc
        ),
      });
      setEditingIncome(null);
    } else {
      const newIncome: Income = {
        id: Date.now().toString(),
        amount: parseFloat(incomeForm.amount),
        currency: incomeForm.currency,
        description: incomeForm.description,
        category: incomeForm.category,
        date: incomeForm.date,
      };
      setData({
        ...data,
        incomes: [...data.incomes, newIncome],
      });
    }

    setIncomeForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Salary',
      date: new Date().toISOString().split('T')[0],
    });
    setShowForm(false);
  };

  const handleRecurringSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingRecurring) {
      setData({
        ...data,
        recurringIncomes: data.recurringIncomes.map(rec =>
          rec.id === editingRecurring.id
            ? { ...recurringForm, id: rec.id, amount: parseFloat(recurringForm.amount) }
            : rec
        ),
      });
      setEditingRecurring(null);
    } else {
      const newRecurring: RecurringIncome = {
        id: Date.now().toString(),
        amount: parseFloat(recurringForm.amount),
        currency: recurringForm.currency,
        description: recurringForm.description,
        category: recurringForm.category,
        dayOfMonth: recurringForm.dayOfMonth,
        isActive: recurringForm.isActive,
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
    });
    setViewMode('recurring');
    setShowForm(true);
  };

  const handleDeleteExpense = (id: string) => {
    if (confirm('Are you sure you want to delete this expense?')) {
      setData({
        ...data,
        expenses: data.expenses.filter(exp => exp.id !== id),
      });
    }
  };

  const handleDeleteIncome = (id: string) => {
    if (confirm('Are you sure you want to delete this income?')) {
      setData({
        ...data,
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

  const totalExpenses = data.expenses.reduce((sum, exp) => {
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
    });
    setIncomeForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Salary',
      date: new Date().toISOString().split('T')[0],
    });
    setRecurringForm({
      amount: '',
      currency: 'USD',
      description: '',
      category: 'Salary',
      dayOfMonth: 1,
      isActive: true,
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
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">
            {editingExpense ? 'Edit Expense' : 'Add New Expense'}
          </h2>
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                required
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="What did you spend on?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <select
                  value={expenseForm.currency}
                  onChange={(e) => setExpenseForm({ ...expenseForm, currency: e.target.value as Currency })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {currencies.map(currency => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {expenseCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold">
                {editingExpense ? 'Update' : 'Add'} Expense
              </button>
              <button type="button" onClick={resetForms} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (viewMode === 'income') {
      return (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-4">
            {editingIncome ? 'Edit Income' : 'Add New Income'}
          </h2>
          <form onSubmit={handleIncomeSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                required
                value={incomeForm.description}
                onChange={(e) => setIncomeForm({ ...incomeForm, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Salary, Freelance, etc."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <select
                  value={incomeForm.currency}
                  onChange={(e) => setIncomeForm({ ...incomeForm, currency: e.target.value as Currency })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {currencies.map(currency => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={incomeForm.category}
                  onChange={(e) => setIncomeForm({ ...incomeForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {incomeCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={incomeForm.date}
                  onChange={(e) => setIncomeForm({ ...incomeForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold">
                {editingIncome ? 'Update' : 'Add'} Income
              </button>
              <button type="button" onClick={resetForms} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
                Cancel
              </button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingRecurring ? 'Edit Recurring Income' : 'Add Recurring Income'}
        </h2>
        <form onSubmit={handleRecurringSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              required
              value={recurringForm.description}
              onChange={(e) => setRecurringForm({ ...recurringForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Monthly Salary, Rent, etc."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                required
                step="0.01"
                min="0"
                value={recurringForm.amount}
                onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={recurringForm.currency}
                onChange={(e) => setRecurringForm({ ...recurringForm, currency: e.target.value as Currency })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {currencies.map(currency => (
                  <option key={currency} value={currency}>{currency}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={recurringForm.category}
                onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {incomeCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Day of Month <Calendar size={16} className="inline ml-1" />
              </label>
              <input
                type="number"
                required
                min="1"
                max="31"
                value={recurringForm.dayOfMonth}
                onChange={(e) => setRecurringForm({ ...recurringForm, dayOfMonth: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="1-31"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={recurringForm.isActive}
              onChange={(e) => setRecurringForm({ ...recurringForm, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label className="text-sm text-gray-700">Active (will be counted in monthly income)</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold">
              {editingRecurring ? 'Update' : 'Add'} Recurring Income
            </button>
            <button type="button" onClick={resetForms} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'expenses' as ViewMode, label: 'Expenses', icon: TrendingDown },
            { id: 'income' as ViewMode, label: 'Income', icon: TrendingUp },
            { id: 'recurring' as ViewMode, label: 'Recurring', icon: Calendar },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setViewMode(tab.id);
                  if (showForm && (tab.id !== viewMode)) {
                    resetForms();
                  }
                }}
                className={`flex-1 py-3 px-2 text-center flex flex-col items-center gap-1 ${
                  viewMode === tab.id
                    ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary Cards */}
      {viewMode === 'expenses' && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">Total Expenses</div>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(totalExpenses, baseCurrency)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Total Count</div>
              <div className="text-2xl font-bold text-gray-800">
                {data.expenses.length}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'income' && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">Total Income</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(totalIncome, baseCurrency)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Monthly Income</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(monthlyIncome, baseCurrency)}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'recurring' && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">Active Recurring Income</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(
                  data.recurringIncomes
                    .filter(r => r.isActive)
                    .reduce((sum, r) => sum + convertCurrency(r.amount, r.currency, baseCurrency), 0),
                  baseCurrency
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Total Recurring</div>
              <div className="text-2xl font-bold text-gray-800">
                {data.recurringIncomes.length}
              </div>
            </div>
          </div>
        </div>
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
          className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg ${
            viewMode === 'expenses' ? 'bg-blue-600' : 'bg-green-600'
          } text-white`}
        >
          <Plus size={20} />
          Add {viewMode === 'expenses' ? 'Expense' : viewMode === 'income' ? 'Income' : 'Recurring Income'}
        </button>
      )}

      {/* Form */}
      {renderForm()}

      {/* Lists */}
      {viewMode === 'expenses' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">All Expenses</h2>
          </div>
          {data.expenses.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No expenses recorded yet. Add your first expense!
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.expenses
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(expense => (
                  <div key={expense.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{expense.description}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          {expense.category} • {new Date(expense.date).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {formatCurrency(expense.amount, expense.currency)} 
                          {expense.currency !== baseCurrency && (
                            <span className="ml-1">
                              ({formatCurrency(convertCurrency(expense.amount, expense.currency, baseCurrency), baseCurrency)})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditExpense(expense)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'income' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">All Income</h2>
          </div>
          {data.incomes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No income recorded yet. Add your first income!
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.incomes
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(income => (
                  <div key={income.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{income.description}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          {income.category} • {new Date(income.date).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-green-600 font-semibold mt-1">
                          {formatCurrency(income.amount, income.currency)} 
                          {income.currency !== baseCurrency && (
                            <span className="ml-1 text-gray-400">
                              ({formatCurrency(convertCurrency(income.amount, income.currency, baseCurrency), baseCurrency)})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditIncome(income)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteIncome(income.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'recurring' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">Recurring Income</h2>
          </div>
          {data.recurringIncomes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No recurring income set up yet. Add your first recurring income!
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.recurringIncomes.map(recurring => {
                const convertedAmount = convertCurrency(recurring.amount, recurring.currency, baseCurrency);
                return (
                  <div key={recurring.id} className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-800">{recurring.description}</div>
                          {recurring.isActive ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">Inactive</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {recurring.category} • Every {recurring.dayOfMonth}{getOrdinalSuffix(recurring.dayOfMonth)} of the month
                        </div>
                        <div className="text-sm text-green-600 font-semibold mt-1">
                          {formatCurrency(convertedAmount, baseCurrency)}/month
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleRecurringActive(recurring.id)}
                          className={`p-2 rounded-lg ${
                            recurring.isActive
                              ? 'text-orange-600 hover:bg-orange-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={recurring.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {recurring.isActive ? '⏸' : '▶'}
                        </button>
                        <button
                          onClick={() => handleEditRecurring(recurring)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteRecurring(recurring.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
