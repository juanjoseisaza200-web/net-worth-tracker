import { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { AppData, Currency } from '../types';
import { calculateNetWorth, calculateTotalExpenses, calculateTotalIncome, calculateCurrencyExposure } from '../utils/calculations';
import { formatCurrency, formatCompactCurrency, formatAdaptiveCurrency, formatCurrencyNoDecimals, convertCurrency } from '../utils/currency';
import { formatDateForDisplay } from '../utils/date';


interface DashboardProps {
  data: AppData;
  baseCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

const currencies: Currency[] = ['USD', 'COP', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

export default function Dashboard({ data, baseCurrency, onCurrencyChange }: DashboardProps) {
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const netWorth = calculateNetWorth(data, baseCurrency);
  const currencyExposure = calculateCurrencyExposure(data, baseCurrency);
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

      {/* Currency Exposure */}
      {currencyExposure.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wider">
            Currency Exposure
          </h2>
          <div className="space-y-3">
            {currencyExposure.map(exposure => (
              <div key={exposure.currency}>
                <div className="flex justify-between items-end mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800">{exposure.currency}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      {exposure.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(exposure.convertedValue, baseCurrency)}
                    </div>
                  </div>
                </div>
                {/* Visual bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${exposure.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Cash Accounts Summary */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          Cash Accounts
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {(data.accounts || []).slice(0, 4).map(acc => (
            <div key={acc.id} className="bg-indigo-50 rounded-lg p-3 overflow-hidden">
              <div className="text-sm text-gray-600 truncate">{acc.name}</div>
              <div className="text-xl font-bold text-indigo-600 truncate">
                {formatCompactCurrency(acc.balance, acc.currency)}
              </div>
            </div>
          ))}
          {(!data.accounts || data.accounts.length === 0) && (
            <div className="col-span-2 text-center text-gray-500 py-2">No accounts added yet.</div>
          )}
        </div>
      </div>

      {/* Investment Summary */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">

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

      {/* Recent Transfers & Automations */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Recent Transfers & Automations
        </h2>
        {(!data.activityLogs || data.activityLogs.length === 0) ? (
          <p className="text-gray-500 text-center py-4">No recent transfers or automations</p>
        ) : (
          <div className="space-y-3">
            {[...data.activityLogs]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 10)
              .map(log => (
                <div key={log.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <div className="font-medium text-gray-800 flex items-center gap-2">
                      {log.type === 'automation' ? (
                        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">Auto</span>
                      ) : (
                        <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">Manual</span>
                      )}
                      {log.description}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-blue-600 truncate max-w-[120px]">
                      {formatCurrency(log.amount, log.currency)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDateForDisplay(log.date.split('T')[0])}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Recent Expenses */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            {showAllExpenses ? 'All Expenses' : 'Current Month Expenses'}
          </h2>
          {data.expenses.some(exp => !exp.date.startsWith(currentMonthStr)) && (
            <button
              onClick={() => setShowAllExpenses(!showAllExpenses)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1 rounded-full transition-colors"
            >
              {showAllExpenses ? 'Show Less' : 'Show All'}
            </button>
          )}
        </div>
        {data.expenses.filter(exp => showAllExpenses || exp.date.startsWith(currentMonthStr)).length === 0 ? (
          <p className="text-gray-500 text-center py-4">No expenses recorded for this period</p>
        ) : (
          <div className="space-y-2">
            {data.expenses
              .filter(exp => showAllExpenses || exp.date.startsWith(currentMonthStr))
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map(expense => (
                <div key={expense.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
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
    </div>
  );
}

