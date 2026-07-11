import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Settings2, Eye, EyeOff, ChevronUp, ChevronDown, Check, Wallet } from 'lucide-react';
import { AppData, Currency, DashboardWidgetConfig } from '../types';
import { calculateNetWorth, calculateTotalExpenses, calculateTotalIncome, calculateCurrencyExposure, calculateAssetAllocation } from '../utils/calculations';
import { formatCurrency, formatCompactCurrency, formatAdaptiveCurrency, formatCurrencyNoDecimals, convertCurrency } from '../utils/currency';
import { formatDateForDisplay } from '../utils/date';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CurrencySelect from './CurrencySelect';
import ChartErrorBoundary from './ChartErrorBoundary';

interface DashboardProps {
  data: AppData;
  setData: (data: AppData) => void;
  baseCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

const DEFAULT_LAYOUT: DashboardWidgetConfig[] = [
  { id: 'netWorthHistory', visible: true, order: 0 },
  { id: 'assetAllocation', visible: true, order: 1 },
  { id: 'currencyExposure', visible: true, order: 2 },
  { id: 'quickStats', visible: true, order: 3 },
  { id: 'netMonthly', visible: true, order: 4 },
  { id: 'cashAccounts', visible: true, order: 5 },
  { id: 'investmentSummary', visible: true, order: 6 },
  { id: 'activityLog', visible: true, order: 7 },
  { id: 'recentExpenses', visible: true, order: 8 },
];

// Merge any default widgets missing from a user's saved layout (e.g. widgets
// added in a later version) so new widgets appear instead of staying hidden.
const mergeLayout = (stored?: DashboardWidgetConfig[]): DashboardWidgetConfig[] => {
  if (!stored || stored.length === 0) return DEFAULT_LAYOUT;
  const known = new Set(stored.map(w => w.id));
  const missing = DEFAULT_LAYOUT
    .filter(w => !known.has(w.id))
    .map((w, i) => ({ ...w, order: stored.length + i }));
  return [...stored, ...missing].sort((a, b) => a.order - b.order);
};

const WIDGET_NAMES: Record<string, string> = {
  netWorthHistory: 'Net Worth Trend',
  assetAllocation: 'Asset Allocation',
  currencyExposure: 'Currency Exposure',
  quickStats: 'Quick Stats (Income/Expenses)',
  netMonthly: 'Net Monthly',
  cashAccounts: 'Cash Accounts',
  investmentSummary: 'Investment Summary',
  activityLog: 'Recent Transfers & Automations',
  recentExpenses: 'Recent Expenses'
};

export default function Dashboard({ data, setData, baseCurrency, onCurrencyChange }: DashboardProps) {
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  
  const [layout, setLayout] = useState<DashboardWidgetConfig[]>(
    mergeLayout(data.settings?.dashboardLayout)
  );

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const netWorth = calculateNetWorth(data, baseCurrency);
  const currencyExposure = calculateCurrencyExposure(data, baseCurrency);
  const assetAllocation = calculateAssetAllocation(data, baseCurrency);
  const netWorthHistoryData = (data.netWorthHistory || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(h => ({ date: h.date, value: convertCurrency(h.value, h.currency, baseCurrency) }));

  // Resolve the account a transaction came from, for display in Recent Expenses.
  const accountNameById = (id: string) =>
    data.accounts?.find(a => a.id === id)?.name || 'Unknown account';
  const monthlyExpenses = calculateTotalExpenses(data, baseCurrency, 'month');
  const monthlyIncome = calculateTotalIncome(data, baseCurrency, 'month');
  const netMonthly = monthlyIncome - monthlyExpenses;

  const totalStocks = data.stocks.length;
  const totalCrypto = data.crypto.length;
  const totalFixedIncome = data.fixedIncome.length;
  const totalVariable = data.variableInvestments.length;

  const handleSaveLayout = () => {
    setIsEditingLayout(false);
    setData({
      ...data,
      settings: {
        ...(data.settings || { autoUpdatePrices: true }),
        dashboardLayout: layout
      }
    });
  };

  const toggleVisibility = (id: string) => {
    setLayout(layout.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const moveWidget = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === layout.length - 1) return;

    const newLayout = [...layout];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap
    const temp = newLayout[index];
    newLayout[index] = newLayout[targetIndex];
    newLayout[targetIndex] = temp;

    // Update order property
    const reordered = newLayout.map((item, i) => ({ ...item, order: i }));
    setLayout(reordered);
  };

  const renderWidget = (id: string) => {
    switch(id) {
      case 'netWorthHistory':
        return (
          <div key={id} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wider">Net Worth Trend</h2>
            {netWorthHistoryData.length < 2 ? (
              <div className="text-center text-gray-400 text-sm py-8 px-2">
                <TrendingUp size={28} className="mx-auto mb-2 text-gray-300" />
                {netWorthHistoryData.length === 0
                  ? 'Your net worth trend will build up here. A point is saved each day you make a change — check back after a couple of days.'
                  : 'Tracking started today. Once there are at least two days of history, your trend line will appear here.'}
              </div>
            ) : (
              <ChartErrorBoundary>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={netWorthHistoryData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tickFormatter={(d) => formatDateForDisplay(d)} tick={{ fontSize: 10 }} minTickGap={24} />
                    <YAxis tickFormatter={(v) => formatCompactCurrency(v, baseCurrency)} tick={{ fontSize: 10 }} width={52} />
                    <Tooltip
                      formatter={(v) => formatCurrency(Number(v), baseCurrency)}
                      labelFormatter={(d) => formatDateForDisplay(d as string)}
                    />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartErrorBoundary>
            )}
          </div>
        );

      case 'assetAllocation':
        if (assetAllocation.length === 0) return null;
        return (
          <div key={id} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wider">Asset Allocation</h2>
            <div className="w-full h-4 rounded-full flex overflow-hidden mb-4 bg-gray-100">
              {assetAllocation.map(asset => (
                <div key={asset.type} className={asset.color} style={{ width: `${asset.percentage}%` }} title={`${asset.type}: ${asset.percentage.toFixed(1)}%`} />
              ))}
            </div>
            <div className="space-y-2">
              {assetAllocation.map(asset => (
                <div key={asset.type} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${asset.color}`}></div>
                    <span className="font-medium text-gray-700">{asset.type}</span>
                    <span className="text-gray-500">({asset.percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="font-semibold text-gray-900">{formatCurrency(asset.value, baseCurrency)}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'currencyExposure':
        if (currencyExposure.length === 0) return null;
        return (
          <div key={id} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wider">Currency Exposure</h2>
            <div className="space-y-3">
              {currencyExposure.map(exposure => (
                <div key={exposure.currency}>
                  <div className="flex justify-between items-end mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800">{exposure.currency}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{exposure.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">{formatCurrency(exposure.nativeValue, exposure.currency)}</div>
                      <div className="text-xs text-gray-500">≈ {formatCurrency(exposure.convertedValue, baseCurrency)}</div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${exposure.percentage}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'quickStats':
        return (
          <div key={id} className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Monthly Income</span>
                <TrendingUp size={20} className="text-green-500" />
              </div>
              <div className="text-2xl font-bold text-green-600">{formatCompactCurrency(monthlyIncome, baseCurrency)}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Monthly Expenses</span>
                <TrendingDown size={20} className="text-red-500" />
              </div>
              <div className="text-2xl font-bold text-red-600">{formatCompactCurrency(monthlyExpenses, baseCurrency)}</div>
            </div>
          </div>
        );

      case 'netMonthly':
        return (
          <div key={id} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Net Monthly</span>
              <DollarSign size={20} className={netMonthly >= 0 ? 'text-green-500' : 'text-red-500'} />
            </div>
            <div className={`text-3xl font-bold ${netMonthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCompactCurrency(netMonthly, baseCurrency)}
            </div>
          </div>
        );

      case 'cashAccounts':
        return (
          <div key={id} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Cash Accounts</h2>
            <div className="grid grid-cols-2 gap-4">
              {(data.accounts || []).slice(0, 4).map(acc => (
                <div key={acc.id} className="bg-indigo-50 rounded-lg p-3 overflow-hidden">
                  <div className="text-sm text-gray-600 truncate">{acc.name}</div>
                  <div className="text-xl font-bold text-indigo-600 truncate">{formatCompactCurrency(acc.balance, acc.currency)}</div>
                </div>
              ))}
              {(!data.accounts || data.accounts.length === 0) && (
                <div className="col-span-2 text-center text-gray-500 py-2">No accounts added yet.</div>
              )}
            </div>
          </div>
        );

      case 'investmentSummary':
        return (
          <div key={id} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Investment Summary</h2>
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
                <div className="text-sm text-gray-600">Fixed</div>
                <div className="text-xl font-bold text-green-600">{totalFixedIncome}</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3">
                <div className="text-sm text-gray-600">Variable</div>
                <div className="text-xl font-bold text-yellow-600">{totalVariable}</div>
              </div>
            </div>
          </div>
        );

      case 'activityLog':
        return (
          <div key={id} className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Transfers & Automations</h2>
            {(!data.activityLogs || data.activityLogs.length === 0) ? (
              <p className="text-gray-500 text-center py-4">No recent transfers</p>
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
                        <div className="font-semibold text-blue-600 truncate max-w-[120px]">{formatCurrency(log.amount, log.currency)}</div>
                        <div className="text-xs text-gray-500">{formatDateForDisplay(log.date.split('T')[0])}</div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );

      case 'recentExpenses':
        return (
          <div key={id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {showAllExpenses ? 'All Expenses' : 'Recent Expenses'}
              </h2>
              {data.expenses.some(exp => !exp.date.startsWith(currentMonthStr)) && (
                <button
                  onClick={() => setShowAllExpenses(!showAllExpenses)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-3 py-1 rounded-full"
                >
                  {showAllExpenses ? 'Less' : 'All'}
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
                      <div className="min-w-0 mr-2">
                        <div className="font-medium text-gray-800 truncate">{expense.description}</div>
                        <div className="text-sm text-gray-500">{expense.category}</div>
                        <div className="inline-flex items-center gap-1 mt-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          <Wallet size={11} className="text-gray-400" />
                          {accountNameById(expense.accountId)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-red-600 truncate max-w-[120px]">{formatCurrencyNoDecimals(expense.amount, expense.currency)}</div>
                        <div className="text-xs text-gray-500">{formatDateForDisplay(expense.date)}</div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="p-4">
      {/* Header with Currency Selector & Edit Layout Button */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-gray-800">Net Worth</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isEditingLayout ? (
              <button 
                onClick={() => setIsEditingLayout(true)}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Customize Layout"
              >
                <Settings2 size={20} />
              </button>
            ) : (
              <button 
                onClick={handleSaveLayout}
                className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Check size={16} /> Save
              </button>
            )}
            
            <CurrencySelect
              value={baseCurrency}
              onChange={onCurrencyChange}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="text-4xl font-bold text-blue-600">
          {formatAdaptiveCurrency(netWorth, baseCurrency)}
        </div>
      </div>

      {isEditingLayout ? (
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <p className="text-sm text-gray-600 mb-4 border-b border-gray-100 pb-3">
            Use the up and down arrows to reorder widgets, or click the eye icon to hide them.
          </p>
          <div className="space-y-2">
            {layout.map((widget, index) => (
              <div 
                key={widget.id}
                className={`flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <button 
                      onClick={() => moveWidget(index, 'up')}
                      disabled={index === 0}
                      className={`p-0.5 rounded ${index === 0 ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-200 hover:text-blue-600'}`}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button 
                      onClick={() => moveWidget(index, 'down')}
                      disabled={index === layout.length - 1}
                      className={`p-0.5 rounded ${index === layout.length - 1 ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-200 hover:text-blue-600'}`}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                  <span className={`font-medium ml-2 ${!widget.visible ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {WIDGET_NAMES[widget.id] || widget.id}
                  </span>
                </div>
                <button 
                  onClick={() => toggleVisibility(widget.id)}
                  className={`p-1.5 rounded-md transition-colors ${widget.visible ? 'text-blue-600 hover:bg-blue-100' : 'text-gray-400 hover:bg-gray-200'}`}
                >
                  {widget.visible ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col space-y-4">
          {layout.filter(w => w.visible).map(w => renderWidget(w.id))}
        </div>
      )}
    </div>
  );
}
