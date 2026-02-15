import { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, PieChart as PieIcon } from 'lucide-react';
import { AppData, Currency } from '../types';
import { calculateNetWorth, calculateTotalExpenses, calculateTotalIncome } from '../utils/calculations';
import { formatCurrency, formatCompactCurrency, formatAdaptiveCurrency, formatCurrencyNoDecimals, convertCurrency } from '../utils/currency';
import { formatDateForDisplay } from '../utils/date';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DashboardProps {
  data: AppData;
  baseCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

const currencies: Currency[] = ['USD', 'COP', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

export default function Dashboard({ data, baseCurrency, onCurrencyChange }: DashboardProps) {
  const netWorth = calculateNetWorth(data, baseCurrency);
  const monthlyExpenses = calculateTotalExpenses(data, baseCurrency, 'month');
  const yearlyExpenses = calculateTotalExpenses(data, baseCurrency, 'year');
  const monthlyIncome = calculateTotalIncome(data, baseCurrency, 'month');
  const yearlyIncome = calculateTotalIncome(data, baseCurrency, 'year');
  const netMonthly = monthlyIncome - monthlyExpenses;

  const totalStocks = data.stocks.length;
  const totalCrypto = data.crypto.length;
  const totalFixedIncome = data.fixedIncome.length;
  const totalVariable = data.variableInvestments.length;

  return (
    <div className="p-4 space-y-4">
      {/* Header with Currency Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800">Net Worth</h1>
          <select
            value={baseCurrency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium"
          >
            {currencies.map(currency => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </div>
        <div className="text-4xl font-bold text-blue-600">
          {formatAdaptiveCurrency(netWorth, baseCurrency)}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Monthly Income</span>
            <TrendingUp size={20} className="text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-600">
            {formatCompactCurrency(monthlyIncome, baseCurrency)}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Monthly Expenses</span>
            <TrendingDown size={20} className="text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-600">
            {formatCompactCurrency(monthlyExpenses, baseCurrency)}
          </div>
        </div>
      </div>

      {/* Net Monthly */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Net Monthly (Income - Expenses)</span>
          <DollarSign size={20} className={netMonthly >= 0 ? 'text-green-500' : 'text-red-500'} />
        </div>
        <div className={`text-3xl font-bold ${netMonthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCompactCurrency(netMonthly, baseCurrency)}
        </div>
      </div>

      {/* Investment Summary */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <PieIcon size={20} className="mr-2" />
          Investment Summary
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-sm text-gray-600">Stocks</div>
            <div className="text-xl font-bold text-blue-600">{totalStocks}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-sm text-gray-600">Crypto</div>
            <div className="text-xl font-bold text-purple-600">{totalCrypto}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-sm text-gray-600">Fixed Income</div>
            <div className="text-xl font-bold text-green-600">{totalFixedIncome}</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-3">
            <div className="text-sm text-gray-600">Variable</div>
            <div className="text-xl font-bold text-yellow-600">{totalVariable}</div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Expenses</h2>
        {data.expenses.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No expenses recorded yet</p>
        ) : (
          <div className="space-y-2">
            {data.expenses
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 5)
              .map(expense => (
                <div key={expense.id} className="flex justify-between items-center py-2 border-b border-gray-100">
                  <div>
                    <div className="font-medium text-gray-800">{expense.description}</div>
                    <div className="text-sm text-gray-500">{expense.category}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-red-600 truncate max-w-[120px]">
                      {formatCurrencyNoDecimals(expense.amount, expense.currency)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDateForDisplay(expense.date)}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Expenses by Category Chart */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Expenses by Category (Month)</h2>
        {(() => {
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth();

          // 1. Filter expenses for current month
          const monthlyExpensesList = data.expenses.filter(expense => {
            const [yearStr, monthStr] = expense.date.split('-');
            const year = parseInt(yearStr);
            const month = parseInt(monthStr) - 1;
            return year === currentYear && month === currentMonth;
          });

          if (monthlyExpensesList.length === 0) {
            return <p className="text-gray-500 text-center py-8">No expenses this month</p>;
          }

          // 2. Group by category and sum
          const categoryTotals: Record<string, number> = {};
          monthlyExpensesList.forEach(expense => {
            const amountInBase = convertCurrency(expense.amount, expense.currency, baseCurrency);
            categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + amountInBase;
          });

          // 3. Convert to array for Recharts
          const chartData = Object.keys(categoryTotals)
            .map(category => ({
              name: category,
              value: categoryTotals[category],
            }))
            .sort((a, b) => b.value - a.value); // Sort highest to lowest

          // Professional color palette
          const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

          return (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => {
                      if (Array.isArray(value) && value.length > 0) return formatCompactCurrency(Number(value[0]), baseCurrency);
                      if (typeof value === 'number') return formatCompactCurrency(value, baseCurrency);
                      return formatCompactCurrency(0, baseCurrency);
                    }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

