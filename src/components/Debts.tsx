import { useState } from 'react';
import { Plus, Trash2, Edit2, Users, DollarSign, ArrowUpRight, ArrowDownRight, Calendar } from 'lucide-react';
import { AppData, Currency, Debt } from '../types';
import { formatCurrency, formatAdaptiveCurrency, convertCurrency } from '../utils/currency';

interface DebtsProps {
  data: AppData;
  setData: (data: AppData) => void;
  baseCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

const currencies: Currency[] = ['USD', 'COP', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

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

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this reminder?')) {
      const newDebts = debts.filter(d => d.id !== id);
      setData({ ...data, debts: newDebts });
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="text-blue-600" /> Reminders
          </h1>
          <select
            value={baseCurrency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {currencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-gray-500">
          This is an isolated reminder board. Debts tracked here do NOT affect your Net Worth.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-600 font-medium">
            <ArrowUpRight size={18} className="text-green-500" />
            Who Owes Me
          </div>
          <div className="text-2xl font-bold text-green-600">
            {formatAdaptiveCurrency(totalReceivables, baseCurrency)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-600 font-medium">
            <ArrowDownRight size={18} className="text-red-500" />
            Who I Owe
          </div>
          <div className="text-2xl font-bold text-red-600">
            {formatAdaptiveCurrency(totalPayables, baseCurrency)}
          </div>
        </div>
      </div>

      {/* Receivables Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-green-50/30">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            Receivables <span className="text-xs font-normal text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">{receivables.length}</span>
          </h2>
          <button 
            onClick={() => openModal(undefined, 'receivable')}
            className="text-green-600 hover:text-green-700 bg-green-100 hover:bg-green-200 p-1.5 rounded-lg transition-colors"
          >
            <Plus size={20} />
          </button>
        </div>
        
        {receivables.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">Nobody owes you money.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {receivables.map(debt => (
              <div key={debt.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800">{debt.personName}</div>
                  <div className="text-sm text-gray-500 truncate">{debt.description}</div>
                  {debt.dueDate && (
                    <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <Calendar size={12} /> Due: {debt.dueDate}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end pl-4">
                  <div className="font-bold text-green-600 whitespace-nowrap">{formatCurrency(debt.amount, debt.currency)}</div>
                  {debt.currency !== baseCurrency && (
                    <div className="text-xs text-gray-400 whitespace-nowrap">≈ {formatCurrency(convertCurrency(debt.amount, debt.currency, baseCurrency), baseCurrency)}</div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => openModal(debt)} className="text-gray-400 hover:text-blue-500"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(debt.id)} className="text-gray-400 hover:text-green-500" title="Mark Settled"><CheckCircle2Icon size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payables Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-red-50/30">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            Payables <span className="text-xs font-normal text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">{payables.length}</span>
          </h2>
          <button 
            onClick={() => openModal(undefined, 'payable')}
            className="text-red-600 hover:text-red-700 bg-red-100 hover:bg-red-200 p-1.5 rounded-lg transition-colors"
          >
            <Plus size={20} />
          </button>
        </div>
        
        {payables.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">You don't owe anybody money!</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {payables.map(debt => (
              <div key={debt.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800">{debt.personName}</div>
                  <div className="text-sm text-gray-500 truncate">{debt.description}</div>
                  {debt.dueDate && (
                    <div className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                      <Calendar size={12} /> Due: {debt.dueDate}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end pl-4">
                  <div className="font-bold text-red-600 whitespace-nowrap">{formatCurrency(debt.amount, debt.currency)}</div>
                  {debt.currency !== baseCurrency && (
                    <div className="text-xs text-gray-400 whitespace-nowrap">≈ {formatCurrency(convertCurrency(debt.amount, debt.currency, baseCurrency), baseCurrency)}</div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => openModal(debt)} className="text-gray-400 hover:text-blue-500"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(debt.id)} className="text-gray-400 hover:text-red-500" title="Mark Settled"><CheckCircle2Icon size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                {editingDebt ? 'Edit Reminder' : 'Add Reminder'}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-700 text-2xl font-light">&times;</button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('receivable')}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${type === 'receivable' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-300 text-gray-600'}`}
                  >
                    They Owe Me
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('payable')}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${type === 'payable' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-gray-300 text-gray-600'}`}
                  >
                    I Owe Them
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Person's Name</label>
                <input
                  type="text"
                  required
                  value={personName}
                  onChange={e => setPersonName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description / Reason</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="e.g. Dinner on Friday"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign size={16} className="text-gray-400" />
                    </div>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full pl-9 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={currency}
                    onChange={e => setCurrency(e.target.value as Currency)}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (Optional)</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 transition-colors"
                >
                  {editingDebt ? 'Save Changes' : 'Add Reminder'}
                </button>
              </div>
            </form>
          </div>
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
