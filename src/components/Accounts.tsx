import { useState } from 'react';
import { Plus, Wallet, ArrowRightLeft, Building2, Trash2, Edit2, Settings2, PlayCircle } from 'lucide-react';
import { AppData, Account, AccountType, Currency, Automation, ActivityLog } from '../types';
import { formatCurrency, formatCompactCurrency, convertCurrency } from '../utils/currency';

interface AccountsProps {
    data: AppData;
    setData: (data: AppData) => void;
    baseCurrency: Currency;
    onCurrencyChange: (currency: Currency) => void;
}

const currencies: Currency[] = ['USD', 'COP', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const accountTypes: { value: AccountType; label: string }[] = [
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' },
    { value: 'cash', label: 'Cash' },
    { value: 'other', label: 'Other' },
];

export default function Accounts({ data, setData, baseCurrency, onCurrencyChange }: AccountsProps) {
    const [viewMode, setViewMode] = useState<'accounts' | 'automations'>('accounts');
    const [showAddForm, setShowAddForm] = useState(false);
    const [showTransferForm, setShowTransferForm] = useState(false);
    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

    const [showAutomationForm, setShowAutomationForm] = useState(false);
    const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);

    const [automationForm, setAutomationForm] = useState({
        name: '',
        type: 'transfer' as 'sweep' | 'transfer',
        sourceAccountId: '',
        destinationAccountId: '',
        amount: '',
        keepAmount: '',
        dayOfMonth: 15,
        isActive: true,
    });

    const [addForm, setAddForm] = useState({
        name: '',
        type: 'checking' as AccountType,
        currency: 'USD' as Currency,
        balance: '',
    });

    const [transferForm, setTransferForm] = useState({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
    });

    const accounts = data.accounts || [];

    const handleAddSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingAccountId) {
            const updatedAccounts = accounts.map(acc =>
                acc.id === editingAccountId
                    ? {
                        ...acc,
                        name: addForm.name,
                        type: addForm.type,
                        currency: addForm.currency,
                        balance: parseFloat(addForm.balance || '0'),
                    }
                    : acc
            );
            setData({
                ...data,
                accounts: updatedAccounts,
            });
            setEditingAccountId(null);
        } else {
            const newAccount: Account = {
                id: Date.now().toString(),
                name: addForm.name,
                type: addForm.type,
                currency: addForm.currency,
                balance: parseFloat(addForm.balance || '0'),
            };

            setData({
                ...data,
                accounts: [...accounts, newAccount],
            });
        }

        setAddForm({
            name: '',
            type: 'checking',
            currency: 'USD',
            balance: '',
        });
        setShowAddForm(false);
    };

    const handleTransferSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (transferForm.fromAccountId === transferForm.toAccountId) {
            alert("Cannot transfer to the same account.");
            return;
        }

        const amount = parseFloat(transferForm.amount);
        if (isNaN(amount) || amount <= 0) return;

        const fromAccount = accounts.find(a => a.id === transferForm.fromAccountId);

        const newAccounts = accounts.map(acc => {
            let newBalance = acc.balance;

            if (acc.id === transferForm.fromAccountId) {
                newBalance -= amount; // Deduct in its own currency
            } else if (acc.id === transferForm.toAccountId && fromAccount) {
                // Add, converting from sender's currency to receiver's currency
                newBalance += convertCurrency(amount, fromAccount.currency, acc.currency);
            }
            return { ...acc, balance: newBalance };
        });

        const newActivityLog: ActivityLog = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            description: `Manual Transfer: ${fromAccount?.name} to ${accounts.find(a => a.id === transferForm.toAccountId)?.name}`,
            amount: amount,
            currency: fromAccount?.currency || 'USD',
            sourceAccountId: transferForm.fromAccountId,
            destinationAccountId: transferForm.toAccountId,
            type: 'manual'
        };

        setData({
            ...data,
            accounts: newAccounts,
            activityLogs: [...(data.activityLogs || []), newActivityLog]
        });

        setTransferForm({
            fromAccountId: '',
            toAccountId: '',
            amount: '',
        });
        setShowTransferForm(false);
    };

    const handleDeleteAccount = (id: string) => {
        // Check if account has tied transactions
        const hasExpenses = data.expenses.some(e => e.accountId === id);
        const hasIncomes = data.incomes.some(i => i.accountId === id);

        if (hasExpenses || hasIncomes) {
            alert("Cannot delete an account that has expenses or incomes attached to it. Please reassign them first.");
            return;
        }

        if (confirm('Are you sure you want to delete this account?')) {
            setData({
                ...data,
                accounts: accounts.filter(acc => acc.id !== id),
            });
        }
    };

    const handleEditAccount = (account: Account) => {
        setEditingAccountId(account.id);
        setAddForm({
            name: account.name,
            type: account.type,
            currency: account.currency,
            balance: account.balance.toString(),
        });
        setShowAddForm(true);
        setShowTransferForm(false);
    };

    const handleAutomationSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const newAutomation: any = {
            id: editingAutomationId || Date.now().toString(),
            name: automationForm.name,
            type: automationForm.type,
            sourceAccountId: automationForm.sourceAccountId,
            destinationAccountId: automationForm.destinationAccountId,
            dayOfMonth: automationForm.dayOfMonth,
            isActive: automationForm.isActive,
        };

        if (automationForm.type === 'transfer') {
            newAutomation.amount = parseFloat(automationForm.amount || '0');
        } else if (automationForm.type === 'sweep') {
            newAutomation.keepAmount = parseFloat(automationForm.keepAmount || '0');
        }

        const existingAutomations = data.automations || [];
        
        if (editingAutomationId) {
            const prevLastRunMonth = existingAutomations.find(a => a.id === editingAutomationId)?.lastRunMonth;
            if (prevLastRunMonth !== undefined) {
                newAutomation.lastRunMonth = prevLastRunMonth;
            }
            setData({
                ...data,
                automations: existingAutomations.map(a => a.id === editingAutomationId ? newAutomation as Automation : a)
            });
        } else {
            // New automation logic: prevent immediate retroactive firing
            const now = new Date();
            const getMonthStr = (y: number, m: number) => {
                let adjustedY = y;
                let adjustedM = m;
                if (adjustedM < 0) {
                    adjustedM += 12;
                    adjustedY -= 1;
                }
                return `${adjustedY}-${String(adjustedM + 1).padStart(2, '0')}`;
            };
            const currentMonthStr = getMonthStr(now.getFullYear(), now.getMonth());
            const previousMonthStr = getMonthStr(now.getFullYear(), now.getMonth() - 1);

            if (newAutomation.dayOfMonth === 0) {
                newAutomation.lastRunMonth = previousMonthStr;
            } else {
                if (now.getDate() >= newAutomation.dayOfMonth) {
                    // We are past the execution day for this month. 
                    // Mark it as run for this month so it doesn't fire immediately.
                    newAutomation.lastRunMonth = currentMonthStr;
                } else {
                    newAutomation.lastRunMonth = previousMonthStr;
                }
            }

            setData({
                ...data,
                automations: [...existingAutomations, newAutomation as Automation]
            });
        }

        setShowAutomationForm(false);
        setEditingAutomationId(null);
    };

    const handleDeleteAutomation = (id: string) => {
        if (confirm('Are you sure you want to delete this automation?')) {
            setData({
                ...data,
                automations: (data.automations || []).filter(a => a.id !== id)
            });
        }
    };

    const handleEditAutomation = (automation: Automation) => {
        setEditingAutomationId(automation.id);
        setAutomationForm({
            name: automation.name,
            type: automation.type,
            sourceAccountId: automation.sourceAccountId,
            destinationAccountId: automation.destinationAccountId,
            amount: automation.amount?.toString() || '',
            keepAmount: automation.keepAmount?.toString() || '',
            dayOfMonth: automation.dayOfMonth,
            isActive: automation.isActive,
        });
        setShowAutomationForm(true);
    };

    const totalCashBaseCurrency = accounts.reduce((sum, acc) => {
        return sum + convertCurrency(acc.balance, acc.currency, baseCurrency);
    }, 0);

    return (
        <div className="p-4 space-y-4 pb-24 relative min-h-screen">
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-4 mb-4">
                <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                    <button
                        onClick={() => setViewMode('accounts')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-md ${viewMode === 'accounts' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
                    >
                        Accounts
                    </button>
                    <button
                        onClick={() => setViewMode('automations')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-md ${viewMode === 'automations' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
                    >
                        Automations
                    </button>
                </div>
                {viewMode === 'accounts' ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold text-gray-800">Accounts</h1>
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
                    <div className="text-sm text-gray-600 mb-1">Total Liquid Cash</div>
                    <div className="text-4xl font-bold text-blue-600">
                        {formatCompactCurrency(totalCashBaseCurrency, baseCurrency)}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold text-gray-800">Automations</h1>
                    </div>
                    <p className="text-sm text-gray-600">
                        Set up automated transfers between your accounts to manage your budget effortlessly.
                    </p>
                  </>
                )}
            </div>

            {viewMode === 'automations' && (
                <>
                    {/* Automations Actions */}
                    <div className="mb-4">
                        <button
                            onClick={() => {
                                setEditingAutomationId(null);
                                setAutomationForm({
                                    name: '', type: 'transfer', sourceAccountId: '', destinationAccountId: '',
                                    amount: '', keepAmount: '', dayOfMonth: 15, isActive: true
                                });
                                setShowAutomationForm(true);
                            }}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg"
                        >
                            <Plus size={20} /> Add Automation
                        </button>
                    </div>

                    {/* Automation Form */}
                    {showAutomationForm && (
                        <div className="bg-white rounded-lg shadow p-4 mb-4">
                            <h2 className="text-lg font-semibold mb-4">{editingAutomationId ? 'Edit Automation' : 'New Automation'}</h2>
                            <form onSubmit={handleAutomationSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={automationForm.name}
                                        onChange={(e) => setAutomationForm({ ...automationForm, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        placeholder="e.g. Savings Sweep"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                        <select
                                            value={automationForm.type}
                                            onChange={(e) => setAutomationForm({ ...automationForm, type: e.target.value as 'sweep' | 'transfer' })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        >
                                            <option value="transfer">Fixed Transfer</option>
                                            <option value="sweep">Balance Sweep</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Day of Month</label>
                                        <select
                                            value={automationForm.dayOfMonth}
                                            onChange={(e) => setAutomationForm({ ...automationForm, dayOfMonth: parseInt(e.target.value) })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        >
                                            <option value={0}>End of Month</option>
                                            {Array.from({length: 28}, (_, i) => i + 1).map(day => (
                                                <option key={day} value={day}>{day}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">From Account</label>
                                        <select
                                            required
                                            value={automationForm.sourceAccountId}
                                            onChange={(e) => setAutomationForm({ ...automationForm, sourceAccountId: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        >
                                            <option value="" disabled>Select</option>
                                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">To Account</label>
                                        <select
                                            required
                                            value={automationForm.destinationAccountId}
                                            onChange={(e) => setAutomationForm({ ...automationForm, destinationAccountId: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        >
                                            <option value="" disabled>Select</option>
                                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {automationForm.type === 'transfer' ? (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Amount</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            required
                                            value={automationForm.amount}
                                            onChange={(e) => setAutomationForm({ ...automationForm, amount: e.target.value.replace(',', '.') })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            placeholder="735000"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Keep Amount in Source Account</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            required
                                            value={automationForm.keepAmount}
                                            onChange={(e) => setAutomationForm({ ...automationForm, keepAmount: e.target.value.replace(',', '.') })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                            placeholder="7500"
                                        />
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={automationForm.isActive}
                                        onChange={(e) => setAutomationForm({ ...automationForm, isActive: e.target.checked })}
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                    />
                                    <label className="text-sm text-gray-700">Automation is Active</label>
                                </div>
                                <div className="flex gap-2">
                                    <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold">Save</button>
                                    <button type="button" onClick={() => setShowAutomationForm(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">Cancel</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Automations List */}
                    <div className="space-y-4">
                        {(data.automations || []).map(automation => {
                            const sourceAcc = accounts.find(a => a.id === automation.sourceAccountId);
                            const destAcc = accounts.find(a => a.id === automation.destinationAccountId);
                            return (
                                <div key={automation.id} className="bg-white rounded-lg shadow p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                                <Settings2 size={20} />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-800">{automation.name}</h3>
                                                <div className="text-sm text-gray-500">
                                                    {automation.dayOfMonth === 0 ? 'End of month' : `On the ${automation.dayOfMonth}th`}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEditAutomation(automation)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                                                <Edit2 size={18} />
                                            </button>
                                            <button onClick={() => handleDeleteAutomation(automation.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg">
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="text-sm text-gray-700 font-medium mb-1">
                                            {sourceAcc?.name || 'Unknown'} <ArrowRightLeft size={14} className="inline mx-1 text-gray-400" /> {destAcc?.name || 'Unknown'}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                            {automation.type === 'transfer' 
                                                ? `Transfer fixed amount: ${formatCurrency(automation.amount || 0, sourceAcc?.currency || 'USD')}`
                                                : `Sweep all except ${formatCurrency(automation.keepAmount || 0, sourceAcc?.currency || 'USD')}`}
                                        </div>
                                    </div>
                                    <div className="mt-3 flex justify-between items-center text-xs">
                                        <span className={`px-2 py-1 rounded-full ${automation.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {automation.isActive ? 'Active' : 'Paused'}
                                        </span>
                                        <span className="text-gray-400">
                                            Last run: {automation.lastRunMonth || 'Never'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        {(!data.automations || data.automations.length === 0) && (
                            <div className="text-center py-8 text-gray-500">No automations configured yet.</div>
                        )}
                    </div>
                </>
            )}

            {viewMode === 'accounts' && (
                <>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <button
                    onClick={() => {
                        setEditingAccountId(null);
                        setAddForm({ name: '', type: 'checking', currency: 'USD', balance: '' });
                        setShowAddForm(true);
                        setShowTransferForm(false);
                    }}
                    className="bg-blue-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg"
                >
                    <Plus size={20} /> Add Account
                </button>
                <button
                    onClick={() => { setShowTransferForm(true); setShowAddForm(false); }}
                    className="bg-purple-600 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg"
                >
                    <ArrowRightLeft size={20} /> Transfer
                </button>
            </div>

            {/* Add/Edit Form */}
            {showAddForm && (
                <div className="bg-white rounded-lg shadow p-4 mb-4">
                    <h2 className="text-lg font-semibold mb-4">{editingAccountId ? 'Edit Account' : 'Add New Account'}</h2>
                    <form onSubmit={handleAddSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                            <input
                                type="text"
                                required
                                value={addForm.name}
                                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="e.g. Chase Checkings"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                <select
                                    value={addForm.type}
                                    onChange={(e) => setAddForm({ ...addForm, type: e.target.value as AccountType })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    {accountTypes.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                                <select
                                    value={addForm.currency}
                                    onChange={(e) => setAddForm({ ...addForm, currency: e.target.value as Currency })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    {currencies.map(currency => (
                                        <option key={currency} value={currency}>{currency}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Initial Balance</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                lang="en-US"
                                required
                                value={addForm.balance}
                                onChange={(e) => {
                                    const val = e.target.value.replace(',', '.');
                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                        setAddForm({ ...addForm, balance: val });
                                    }
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="0.00"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold">
                                {editingAccountId ? 'Update Account' : 'Save Account'}
                            </button>
                            <button type="button" onClick={() => { setShowAddForm(false); setEditingAccountId(null); }} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Transfer Form */}
            {showTransferForm && (
                <div className="bg-white rounded-lg shadow p-4 mb-4">
                    <h2 className="text-lg font-semibold mb-4 text-purple-800">Transfer Funds</h2>
                    <form onSubmit={handleTransferSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">From Account</label>
                            <select
                                required
                                value={transferForm.fromAccountId}
                                onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                                <option value="" disabled>Select Source</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance, acc.currency)})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">To Account</label>
                            <select
                                required
                                value={transferForm.toAccountId}
                                onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                                <option value="" disabled>Select Destination</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance, acc.currency)})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Amount (in {accounts.find(a => a.id === transferForm.fromAccountId)?.currency || 'source currency'})
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                lang="en-US"
                                required
                                value={transferForm.amount}
                                onChange={(e) => {
                                    const val = e.target.value.replace(',', '.');
                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                        setTransferForm({ ...transferForm, amount: val });
                                    }
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                placeholder="0.00"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-semibold">
                                Transfer
                            </button>
                            <button type="button" onClick={() => setShowTransferForm(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Account List */}
            <div className="space-y-4">
                {accounts.map(account => (
                    <div key={account.id} className="bg-white rounded-lg shadow p-4">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                    {account.type === 'checking' || account.type === 'savings' ? <Building2 size={20} /> : <Wallet size={20} />}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-800">{account.name}</h3>
                                    <div className="text-sm text-gray-500 capitalize">{account.type}</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEditAccount(account)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                >
                                    <Edit2 size={18} />
                                </button>
                                <button
                                    onClick={() => handleDeleteAccount(account.id)}
                                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="text-2xl font-bold text-gray-900">
                                {formatCurrency(account.balance, account.currency)}
                            </div>
                            {account.currency !== baseCurrency && (
                                <div className="text-sm text-gray-500">
                                    ≈ {formatCurrency(convertCurrency(account.balance, account.currency, baseCurrency), baseCurrency)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {accounts.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        No accounts added yet.
                    </div>
                )}
            </div>
          </>
        )}
        </div>
    );
}
