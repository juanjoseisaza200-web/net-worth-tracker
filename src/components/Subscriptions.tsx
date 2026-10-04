import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Repeat, CalendarClock } from 'lucide-react';
import { AppData, Currency, Subscription } from '../types';
import { formatCurrency, formatCurrencyTrimmed, formatCompactCurrency, convertCurrency } from '../utils/currency';
import { expenseCategories } from '../utils/categories';
import { formatDateForDisplay } from '../utils/date';
import { parseAmount } from '../utils/number';
import { initialChargedPeriod, monthlyCost, nextChargeDate } from '../utils/subscriptions';
import CurrencySelect from './CurrencySelect';
import { Section, Row, Switch } from './ios';
import { ios } from './iosStyles';

interface SubscriptionsProps {
  data: AppData;
  setData: (data: AppData) => void;
  baseCurrency: Currency;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const emptyForm = (accountId: string) => ({
  name: '',
  amount: '',
  currency: 'COP' as Currency,
  accountId,
  category: 'Entertainment',
  frequency: 'monthly' as Subscription['frequency'],
  billingDay: new Date().getDate(),
  billingMonth: new Date().getMonth() + 1,
  smsMatch: '',
  isActive: true,
});

/** Expenses › Subs: recurring charges booked on their date (see utils/subscriptions). */
export default function Subscriptions({ data, setData, baseCurrency }: SubscriptionsProps) {
  const subs = data.subscriptions ?? [];
  const defaultAccount = data.accounts?.[0]?.id || '';
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [form, setForm] = useState(emptyForm(defaultAccount));
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editing]);

  const resetForm = () => {
    setForm(emptyForm(defaultAccount));
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(form.amount);
    if (amount === null || amount <= 0) {
      alert('Please enter a valid amount greater than 0.');
      return;
    }
    if (!form.accountId) {
      alert('Choose the account or card it is charged to.');
      return;
    }
    const sub: Subscription = {
      id: editing?.id ?? Date.now().toString(),
      name: form.name.trim(),
      amount,
      currency: form.currency,
      accountId: form.accountId,
      category: form.category,
      frequency: form.frequency,
      billingDay: Math.min(31, Math.max(1, form.billingDay || 1)),
      isActive: form.isActive,
    };
    if (form.frequency === 'yearly') sub.billingMonth = form.billingMonth;
    if (form.smsMatch.trim()) sub.smsMatch = form.smsMatch.trim();

    // Keep the charge history unless the schedule's periods changed shape;
    // a new schedule starts as "paid up to today", like a new subscription.
    const sameSchedule = editing
      && editing.frequency === sub.frequency
      && (sub.frequency === 'monthly' || editing.billingMonth === sub.billingMonth);
    sub.lastChargedPeriod = sameSchedule && editing.lastChargedPeriod
      ? editing.lastChargedPeriod
      : initialChargedPeriod(sub, new Date());

    setData({
      ...data,
      subscriptions: editing ? subs.map(s => (s.id === editing.id ? sub : s)) : [...subs, sub],
    });
    resetForm();
  };

  const handleEdit = (sub: Subscription) => {
    setEditing(sub);
    setForm({
      name: sub.name,
      amount: sub.amount.toString(),
      currency: sub.currency,
      accountId: sub.accountId,
      category: sub.category,
      frequency: sub.frequency,
      billingDay: sub.billingDay,
      billingMonth: sub.billingMonth ?? new Date().getMonth() + 1,
      smsMatch: sub.smsMatch ?? '',
      isActive: sub.isActive,
    });
    setShowForm(true);
  };

  const handleDelete = (sub: Subscription) => {
    if (!confirm(`Delete "${sub.name}"? Charges already recorded stay in your expenses.`)) return;
    setData({ ...data, subscriptions: subs.filter(s => s.id !== sub.id) });
  };

  const toggleActive = (sub: Subscription) => {
    setData({
      ...data,
      subscriptions: subs.map(s => (s.id !== sub.id ? s
        // Resuming must not charge the months it was paused.
        : s.isActive ? { ...s, isActive: false } : { ...s, isActive: true, lastChargedPeriod: initialChargedPeriod(s, new Date()) })),
    });
  };

  const active = subs.filter(s => s.isActive);
  const monthlyTotal = active.reduce((sum, s) => sum + convertCurrency(monthlyCost(s), s.currency, baseCurrency), 0);
  const sorted = [...subs].sort((a, b) =>
    Number(b.isActive) - Number(a.isActive) || nextChargeDate(a).localeCompare(nextChargeDate(b)));
  const accountName = (id: string) => data.accounts.find(a => a.id === id)?.name ?? 'Missing account';

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className={`${ios.card} p-4 min-w-0`}>
          <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-red">
            <Repeat size={16} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Per Month</span>
          </div>
          <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
            {formatCompactCurrency(monthlyTotal, baseCurrency)}
          </div>
          <div className="text-ios-footnote text-ios-secondary">{active.length} active</div>
        </div>
        <div className={`${ios.card} p-4 min-w-0`}>
          <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-secondary">
            <CalendarClock size={16} strokeWidth={2.5} className="shrink-0" /> <span className="truncate">Per Year</span>
          </div>
          <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
            {formatCompactCurrency(monthlyTotal * 12, baseCurrency)}
          </div>
        </div>
      </div>

      {!showForm && (
        <button onClick={() => setShowForm(true)} className={`${ios.buttonPrimary} w-full`}>
          <Plus size={20} strokeWidth={2.5} />
          Add Subscription
        </button>
      )}

      <div ref={formRef} className="scroll-mt-16 empty:hidden">
        {showForm && (
          <div className={`${ios.card} p-4`}>
            <h2 className="text-ios-headline mb-4 px-1">{editing ? 'Edit Subscription' : 'Add Subscription'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={ios.label}>Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={ios.input}
                  placeholder="Netflix, Spotify, iCloud..."
                />
              </div>
              <div>
                <label className={ios.label}>Charged to</label>
                <select
                  value={form.accountId}
                  onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                  className={ios.select}
                >
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
                    required
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className={`${ios.input} tabular-nums`}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={ios.label}>Currency</label>
                  <CurrencySelect value={form.currency} onChange={(c) => setForm({ ...form, currency: c })} className={ios.select} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={ios.label}>Billed</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value as Subscription['frequency'] })}
                    className={ios.select}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className={ios.label}>Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={ios.select}
                  >
                    {expenseCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {form.frequency === 'yearly' && (
                  <div>
                    <label className={ios.label}>Month</label>
                    <select
                      value={form.billingMonth}
                      onChange={(e) => setForm({ ...form, billingMonth: Number(e.target.value) })}
                      className={ios.select}
                    >
                      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className={ios.label}>Day of month</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    required
                    min="1"
                    max="31"
                    value={form.billingDay}
                    onChange={(e) => setForm({ ...form, billingDay: parseInt(e.target.value) })}
                    className={`${ios.input} tabular-nums`}
                  />
                </div>
              </div>
              <div>
                <label className={ios.label}>Text in the bank SMS (optional)</label>
                <input
                  type="text"
                  value={form.smsMatch}
                  onChange={(e) => setForm({ ...form, smsMatch: e.target.value })}
                  className={ios.input}
                  placeholder="e.g., NETFLIX"
                />
                <p className="mt-1.5 px-1 text-ios-footnote text-ios-secondary">
                  If the bank texts you for this charge, the SMS records it with the real amount. Leave empty to record it automatically on its date.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" className={`${ios.buttonPrimary} flex-1`}>{editing ? 'Save' : 'Add'}</button>
                <button type="button" onClick={resetForm} className={`${ios.buttonSecondary} flex-1`}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <Section title="Subscriptions">
        {sorted.length === 0 ? (
          <div className="px-6 py-8 text-center text-ios-subhead text-ios-secondary">No subscriptions yet. Add your first one!</div>
        ) : sorted.map(sub => (
          <Row
            key={sub.id}
            onClick={() => handleEdit(sub)}
            title={<span className={sub.isActive ? 'font-semibold' : 'text-ios-secondary'}>{sub.name}</span>}
            subtitle={
              <>
                <div className="truncate tabular-nums">
                  {formatCurrencyTrimmed(sub.amount, sub.currency)}/{sub.frequency === 'yearly' ? 'year' : 'month'} · {accountName(sub.accountId)}
                </div>
                <div className="truncate">
                  {sub.isActive ? `Next: ${formatDateForDisplay(nextChargeDate(sub))}` : 'Paused'}
                  {sub.smsMatch ? ' · by SMS' : ''}
                </div>
              </>
            }
            value={<span className={sub.isActive ? '' : 'text-ios-secondary'}>{formatCompactCurrency(convertCurrency(monthlyCost(sub), sub.currency, baseCurrency), baseCurrency)}</span>}
            detail="/month"
            accessory={
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleDelete(sub)} className={ios.rowActionDestructive} aria-label="Delete subscription">
                  <Trash2 size={17} />
                </button>
                <div className="ml-1">
                  <Switch checked={sub.isActive} onChange={() => toggleActive(sub)} label={sub.isActive ? 'Pause' : 'Resume'} />
                </div>
              </div>
            }
          />
        ))}
      </Section>
    </>
  );
}
