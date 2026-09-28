import { useState } from 'react';
import { Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AppData, Currency, Debt } from '../types';
import { formatCurrency, formatCurrencyTrimmed, formatAdaptiveCurrency, convertCurrency } from '../utils/currency';
import CurrencySelect from './CurrencySelect';
import { PageTitle, Section, Row, Segmented } from './ios';
import { ios } from './iosStyles';

interface DebtsProps {
  data: AppData;
  setData: (data: AppData) => void;
  baseCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

export default function Debts({ data, setData, baseCurrency, onCurrencyChange }: DebtsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  
  const [type, setType] = useState<'receivable' | 'payable'>('receivable');
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(baseCurrency);
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const debts = data.debts || [];
  const receivables = debts.filter(d => d.type === 'receivable');
  const payables = debts.filter(d => d.type === 'payable');

  const totalReceivables = receivables.reduce((sum, d) => sum + convertCurrency(d.amount, d.currency, baseCurrency), 0);
  const totalPayables = payables.reduce((sum, d) => sum + convertCurrency(d.amount, d.currency, baseCurrency), 0);

  const openModal = (debt?: Debt, initialType: 'receivable' | 'payable' = 'receivable') => {
    if (debt) {
      setEditingDebt(debt);
      setType(debt.type);
      setPersonName(debt.personName);
      setAmount(debt.amount.toString());
      setCurrency(debt.currency);
      setDescription(debt.description);
      setDueDate(debt.dueDate || '');
    } else {
      setEditingDebt(null);
      setType(initialType);
      setPersonName('');
      setAmount('');
      setCurrency(baseCurrency);
      setDescription('');
      setDueDate('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingDebt(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newDebt: Debt = {
      id: editingDebt ? editingDebt.id : Date.now().toString(),
      type,
      personName,
      amount: parseFloat(amount) || 0,
      currency,
      description,
      dueDate
    };

    let newDebts;
    if (editingDebt) {
      newDebts = debts.map(d => d.id === editingDebt.id ? newDebt : d);
    } else {
      newDebts = [...debts, newDebt];
    }

    setData({ ...data, debts: newDebts });
    closeModal();
  };

  // "Settling" a debt removes it from the reminder list (there is no settled
  // flag in the model). Named to match the button's "Mark Settled" label so the
  // copy and the action agree.
  const handleSettle = (id: string) => {
    if (window.confirm('Mark this as settled? It will be removed from your reminders.')) {
      const newDebts = debts.filter(d => d.id !== id);
      setData({ ...data, debts: newDebts });
    }
  };

  const renderList = (list: Debt[], kind: 'receivable' | 'payable') => (
    <Section
      title={`${kind === 'receivable' ? 'Receivables' : 'Payables'} (${list.length})`}
      action={
        <button
          onClick={() => openModal(undefined, kind)}
          className="flex items-center gap-1 text-ios-subhead text-ios-blue active:opacity-60"
        >
          <Plus size={16} strokeWidth={2.5} /> Add
        </button>
      }
    >
      {list.length === 0 ? (
        <div className="py-6 text-center text-ios-secondary text-ios-subhead">
          {kind === 'receivable' ? 'Nobody owes you money.' : "You don't owe anybody money!"}
        </div>
      ) : (
        list.map(debt => (
          <Row
            key={debt.id}
            onClick={() => openModal(debt)}
            title={debt.personName}
            subtitle={debt.dueDate ? `${debt.description} · Due ${debt.dueDate}` : debt.description}
            value={
              <span className={kind === 'receivable' ? 'text-ios-green' : 'text-ios-red'}>
                {formatCurrencyTrimmed(debt.amount, debt.currency)}
              </span>
            }
            detail={debt.currency !== baseCurrency
              ? `≈ ${formatCurrency(convertCurrency(debt.amount, debt.currency, baseCurrency), baseCurrency)}`
              : undefined}
            accessory={
              <div className="flex items-center pl-1">
                <button onClick={() => handleSettle(debt.id)} className={ios.rowAction} title="Mark Settled" aria-label="Mark Settled"><CheckCircle2Icon width={19} height={19} /></button>
              </div>
            }
          />
        ))
      )}
    </Section>
  );

  return (
    <div className="px-4 pb-4">
      <PageTitle title="Reminders">
        <CurrencySelect
          value={baseCurrency}
          onChange={onCurrencyChange}
          aria-label="View currency"
          className={ios.pillSelect}
        />
      </PageTitle>
      <p className="px-1 -mt-2 mb-6 text-ios-subhead text-ios-secondary">
        This is an isolated reminder board. Debts tracked here do NOT affect your Net Worth.
      </p>

      <div className="space-y-6">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`${ios.card} p-4`}>
            <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-green">
              <ArrowUpRight size={16} strokeWidth={2.5} /> Who Owes Me
            </div>
            <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
              {formatAdaptiveCurrency(totalReceivables, baseCurrency)}
            </div>
          </div>
          <div className={`${ios.card} p-4`}>
            <div className="flex items-center gap-1.5 text-ios-subhead font-semibold text-ios-red">
              <ArrowDownRight size={16} strokeWidth={2.5} /> Who I Owe
            </div>
            <div className="font-rounded text-ios-title2 font-bold mt-2 tabular-nums truncate">
              {formatAdaptiveCurrency(totalPayables, baseCurrency)}
            </div>
          </div>
        </div>

        {renderList(receivables, 'receivable')}
        {renderList(payables, 'payable')}
      </div>

      {/* Add/Edit sheet (iOS modal sheet: Cancel · Title · Save) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={closeModal}>
          <form
            onSubmit={handleSave}
            onClick={e => e.stopPropagation()}
            className="bg-ios-bg w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-ios sm:rounded-ios pb-8"
          >
            <div className="sticky top-0 ios-material flex items-center justify-between px-4 h-14 rounded-t-ios">
              <button type="button" onClick={closeModal} className="text-ios-body text-ios-blue active:opacity-60">Cancel</button>
              <h2 className="text-ios-headline">{editingDebt ? 'Edit Reminder' : 'Add Reminder'}</h2>
              <button type="submit" className="text-ios-headline text-ios-blue active:opacity-60">{editingDebt ? 'Save' : 'Add'}</button>
            </div>

            <div className="px-4 pt-2 space-y-5">
              <Segmented
                value={type}
                onChange={setType}
                options={[
                  { value: 'receivable', label: 'They Owe Me' },
                  { value: 'payable', label: 'I Owe Them' },
                ]}
              />

              <div className={`${ios.card} p-4 space-y-4`}>
                <div>
                  <label className={ios.label}>Person's Name</label>
                  <input
                    type="text"
                    required
                    value={personName}
                    onChange={e => setPersonName(e.target.value)}
                    className={ios.input}
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className={ios.label}>Description / Reason</label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className={ios.input}
                    placeholder="e.g. Dinner on Friday"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={ios.label}>Amount</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className={ios.input}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className={ios.label}>Currency</label>
                    <CurrencySelect value={currency} onChange={setCurrency} className={ios.select} />
                  </div>
                </div>
                <div>
                  <label className={ios.label}>Due Date (Optional)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className={ios.input}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// Inline the check icon component to avoid importing it if it doesn't exist
function CheckCircle2Icon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
