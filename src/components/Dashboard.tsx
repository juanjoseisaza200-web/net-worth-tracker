import { useState } from 'react';
import { TrendingUp, TrendingDown, SlidersHorizontal, ChevronUp, ChevronDown, Landmark, PiggyBank, Banknote, CreditCard, Wallet, LineChart as LineChartIcon, Bitcoin, Percent, ArrowLeftRight, Repeat } from 'lucide-react';
import { AccountType, AppData, Currency, DashboardWidgetConfig } from '../types';
import { calculateNetWorth, calculateTotalExpenses, calculateTotalIncome, calculateCurrencyExposure, calculateAssetAllocation } from '../utils/calculations';
import { formatCurrency, formatCompactCurrency, formatAdaptiveCurrency, formatCurrencyNoDecimals, convertCurrency } from '../utils/currency';
import { formatDateForDisplay } from '../utils/date';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CurrencySelect from './CurrencySelect';
import ChartErrorBoundary from './ChartErrorBoundary';
import { Section, Row, IconSquare, Switch } from './ios';
import { useIosColors } from '../utils/useIosColors';

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

// Allocation colors come from calculations.ts as Tailwind classes; map them
// onto the iOS system palette here so that file stays presentation-agnostic.
const ALLOCATION_COLORS: Record<string, string> = {
  'bg-green-500': 'var(--ios-green)',
  'bg-blue-500': 'var(--ios-blue)',
  'bg-purple-500': 'var(--ios-purple)',
  'bg-orange-500': 'var(--ios-orange)',
  'bg-gray-500': 'var(--ios-gray)',
};

const ACCOUNT_ICONS: Record<AccountType, { icon: typeof Landmark; color: string }> = {
  checking: { icon: Landmark, color: 'var(--ios-blue)' },
  savings: { icon: PiggyBank, color: 'var(--ios-green)' },
  cash: { icon: Banknote, color: 'var(--ios-teal)' },
  credit: { icon: CreditCard, color: 'var(--ios-orange)' },
  other: { icon: Wallet, color: 'var(--ios-gray)' },
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
  const colors = useIosColors();
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
          <Section key={id} title="Net Worth Trend">
            {netWorthHistoryData.length < 2 ? (
              <div className="text-center text-ios-secondary text-ios-subhead py-8 px-6">
                <TrendingUp size={28} className="mx-auto mb-2 text-ios-tertiary" />
                {netWorthHistoryData.length === 0
                  ? 'Your net worth trend will build up here. A point is saved each day you make a change — check back after a couple of days.'
                  : 'Tracking started today. Once there are at least two days of history, your trend line will appear here.'}
              </div>
            ) : (
              <div className="pt-4 pl-2 pr-3 pb-2">
                <ChartErrorBoundary>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={netWorthHistoryData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={colors.separator} />
                      <XAxis dataKey="date" tickFormatter={(d) => formatDateForDisplay(d)} tick={{ fontSize: 11, fill: colors.secondary }} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tickFormatter={(v) => formatCompactCurrency(v, baseCurrency)} tick={{ fontSize: 11, fill: colors.secondary }} axisLine={false} tickLine={false} width={64} />
                      <Tooltip
                        formatter={(v) => formatCurrency(Number(v), baseCurrency)}
                        labelFormatter={(d) => formatDateForDisplay(d as string)}
                        contentStyle={{ background: 'var(--ios-card)', border: 'none', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', color: 'var(--ios-label)' }}
                      />
                      <Line type="monotone" dataKey="value" stroke={colors.blue} strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartErrorBoundary>
              </div>
            )}
          </Section>
        );

      case 'assetAllocation':
        if (assetAllocation.length === 0) return null;
        return (
          <Section key={id} title="Asset Allocation">
            <div className="px-4 pt-4 pb-1">
              <div className="w-full h-3 rounded-full flex overflow-hidden gap-[2px]">
                {assetAllocation.map(asset => (
                  <div key={asset.type} style={{ width: `${asset.percentage}%`, backgroundColor: ALLOCATION_COLORS[asset.color] }} title={`${asset.type}: ${asset.percentage.toFixed(1)}%`} />
                ))}
              </div>
            </div>
            {assetAllocation.map(asset => (
              <Row
                key={asset.type}
                icon={<div className="w-2.5 h-2.5 rounded-full ml-1" style={{ backgroundColor: ALLOCATION_COLORS[asset.color] }} />}
                title={asset.type}
                value={formatCurrency(asset.value, baseCurrency)}
                detail={`${asset.percentage.toFixed(1)}%`}
              />
            ))}
          </Section>
        );

      case 'currencyExposure':
        if (currencyExposure.length === 0) return null;
        return (
          <Section key={id} title="Currency Exposure">
            {currencyExposure.map(exposure => (
              <div key={exposure.currency} className="ios-row pl-4">
                <div className="ios-row-content py-3 pr-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-ios-headline">{exposure.currency}</span>
                      <span className="text-ios-footnote text-ios-secondary tabular-nums">{exposure.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="text-right">
                      <div className="text-ios-body tabular-nums">{formatCurrency(exposure.nativeValue, exposure.currency)}</div>
                      <div className="text-ios-footnote text-ios-secondary tabular-nums">≈ {formatCurrency(exposure.convertedValue, baseCurrency)}</div>
                    </div>
                  </div>
                  <div className="w-full bg-ios-fill rounded-full h-1.5 overflow-hidden">
                    <div className="bg-ios-blue h-1.5 rounded-full" style={{ width: `${exposure.percentage}%` }}></div>
                  </div>
                </div>
              </div>
            ))}
          </Section>
        );

      case 'quickStats':
        return (
          <div key={id} className="grid grid-cols-2 gap-3">
            <div className="bg-ios-card rounded-ios p-4">
              <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-green">
                <TrendingUp size={16} strokeWidth={2.5} /> Income
              </div>
              <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">{formatCompactCurrency(monthlyIncome, baseCurrency)}</div>
              <div className="text-ios-footnote text-ios-secondary">This month</div>
            </div>
            <div className="bg-ios-card rounded-ios p-4">
              <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-red">
                <TrendingDown size={16} strokeWidth={2.5} /> Expenses
              </div>
              <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">{formatCompactCurrency(monthlyExpenses, baseCurrency)}</div>
              <div className="text-ios-footnote text-ios-secondary">This month</div>
            </div>
          </div>
        );

      case 'netMonthly':
        return (
          <div key={id} className="bg-ios-card rounded-ios p-4">
            <div className="text-ios-subhead font-semibold text-ios-secondary">Net this month</div>
            <div className={`font-rounded text-[28px] leading-[34px] font-bold mt-1 tabular-nums ${netMonthly >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
              {netMonthly >= 0 ? '+' : ''}{formatCompactCurrency(netMonthly, baseCurrency)}
            </div>
          </div>
        );

      case 'cashAccounts':
        return (
          <Section key={id} title="Accounts">
            {(data.accounts || []).slice(0, 4).map(acc => {
              const { icon, color } = ACCOUNT_ICONS[acc.type] || ACCOUNT_ICONS.other;
              return (
                <Row
                  key={acc.id}
                  to="/accounts"
                  icon={<IconSquare icon={icon} color={color} />}
                  title={acc.name}
                  value={formatCompactCurrency(acc.balance, acc.currency)}
                />
              );
            })}
            {(!data.accounts || data.accounts.length === 0) && (
              <div className="text-center text-ios-secondary py-4">No accounts added yet.</div>
            )}
          </Section>
        );

      case 'investmentSummary':
        return (
          <Section key={id} title="Investments">
            <Row to="/investments" icon={<IconSquare icon={LineChartIcon} color="var(--ios-blue)" />} title="Stocks" value={totalStocks} />
            <Row to="/investments" icon={<IconSquare icon={Bitcoin} color="var(--ios-purple)" />} title="Crypto" value={totalCrypto} />
            <Row to="/investments" icon={<IconSquare icon={Percent} color="var(--ios-green)" />} title="Fixed Income" value={totalFixedIncome} />
          </Section>
        );

      case 'activityLog':
        return (
          <Section key={id} title="Transfers & Automations">
            {(!data.activityLogs || data.activityLogs.length === 0) ? (
              <p className="text-ios-secondary text-center py-4">No recent transfers</p>
            ) : (
              [...data.activityLogs]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 10)
                .map(log => (
                  <Row
                    key={log.id}
                    icon={<IconSquare icon={log.type === 'automation' ? Repeat : ArrowLeftRight} color={log.type === 'automation' ? 'var(--ios-indigo)' : 'var(--ios-gray)'} />}
                    title={log.description}
                    subtitle={log.type === 'automation' ? 'Automation' : log.type === 'cardPayment' ? 'Card payment' : 'Manual'}
                    value={formatCurrencyNoDecimals(log.amount, log.currency)}
                    detail={formatDateForDisplay(log.date.split('T')[0])}
                  />
                ))
            )}
          </Section>
        );

      case 'recentExpenses': {
        const visible = data.expenses
          .filter(exp => showAllExpenses || exp.date.startsWith(currentMonthStr))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return (
          <Section
            key={id}
            title={showAllExpenses ? 'All Expenses' : 'Recent Expenses'}
            action={data.expenses.some(exp => !exp.date.startsWith(currentMonthStr)) && (
              <button onClick={() => setShowAllExpenses(!showAllExpenses)} className="text-ios-subhead text-ios-blue active:opacity-60">
                {showAllExpenses ? 'Show Less' : 'Show All'}
              </button>
            )}
          >
            {visible.length === 0 ? (
              <p className="text-ios-secondary text-center py-4">No expenses recorded for this period</p>
            ) : (
              visible.map(expense => (
                <Row
                  key={expense.id}
                  title={expense.description}
                  subtitle={`${expense.category} · ${accountNameById(expense.accountId)}`}
                  value={<span className="text-ios-red">−{formatCurrencyNoDecimals(expense.amount, expense.currency)}</span>}
                  detail={formatDateForDisplay(expense.date)}
                />
              ))
            )}
          </Section>
        );
      }

      default: return null;
    }
  };

  return (
    <div className="px-4 pb-4">
      {/* Large title + actions, then the headline number */}
      <div className="flex items-end justify-between px-1 pt-1">
        <h1 className="text-ios-large">Net Worth</h1>
        <div className="flex items-center gap-2 mb-1">
          {!isEditingLayout ? (
            <button
              onClick={() => setIsEditingLayout(true)}
              className="w-9 h-9 rounded-full bg-ios-fill text-ios-blue flex items-center justify-center active:opacity-60"
              aria-label="Customize Layout"
            >
              <SlidersHorizontal size={18} />
            </button>
          ) : (
            <button
              onClick={handleSaveLayout}
              className="h-9 px-4 rounded-full bg-ios-blue text-white text-ios-subhead font-semibold active:opacity-80"
            >
              Done
            </button>
          )}
          <CurrencySelect
            value={baseCurrency}
            onChange={onCurrencyChange}
            aria-label="View currency"
            className="h-9 pl-3 pr-3 rounded-full bg-ios-fill text-ios-blue text-ios-subhead font-semibold appearance-none text-center focus:outline-none"
          />
        </div>
      </div>
      <div className="px-1 mt-1 mb-6 font-rounded text-[40px] leading-[48px] font-bold tabular-nums tracking-tight truncate">
        {formatAdaptiveCurrency(netWorth, baseCurrency)}
      </div>

      {isEditingLayout ? (
        <Section title="Widgets" footer="Reorder with the arrows. Turn a widget off to hide it from your Net Worth screen.">
          {layout.map((widget, index) => (
            <div key={widget.id} className="ios-row flex items-center pl-2">
              <div className="flex flex-col py-1">
                <button
                  onClick={() => moveWidget(index, 'up')}
                  disabled={index === 0}
                  aria-label="Move up"
                  className="p-1 text-ios-blue disabled:text-ios-tertiary"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => moveWidget(index, 'down')}
                  disabled={index === layout.length - 1}
                  aria-label="Move down"
                  className="p-1 text-ios-blue disabled:text-ios-tertiary"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              <div className="ios-row-content flex-1 flex items-center justify-between gap-3 py-2.5 pr-4 ml-2">
                <span className={`text-ios-body ${widget.visible ? '' : 'text-ios-secondary'}`}>
                  {WIDGET_NAMES[widget.id] || widget.id}
                </span>
                <Switch checked={widget.visible} onChange={() => toggleVisibility(widget.id)} label={`Show ${WIDGET_NAMES[widget.id] || widget.id}`} />
              </div>
            </div>
          ))}
        </Section>
      ) : (
        <div className="flex flex-col space-y-6">
          {layout.filter(w => w.visible).map(w => renderWidget(w.id))}
        </div>
      )}
    </div>
  );
}
