import { useState } from 'react';
import { Plus, Wallet, ArrowRightLeft, Building2, Trash2 } from 'lucide-react';
import { AppData, Account, AccountType, Currency } from '../types';
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
    const [showAddForm, setShowAddForm] = useState(false);
    const [showTransferForm, setShowTransferForm] = useState(false);

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

        setData({
            ...data,
            accounts: newAccounts,
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

    const totalCashBaseCurrency = accounts.reduce((sum, acc) => {
        return sum + convertCurrency(acc.balance, acc.currency, baseCurrency);
    }, 0);

    return (
        <div className="p-4 space-y-4 pb-24 relative min-h-screen">
            {/* Header */}
            <div className="bg-white rounded-lg shadow p-4 mb-4">
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
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <button
                    onClick={() => { setShowAddForm(true); setShowTransferForm(false); }}
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

            {/* Add Form */}
            {showAddForm && (
                <div className="bg-white rounded-lg shadow p-4 mb-4">
                    <h2 className="text-lg font-semibold mb-4">Add New Account</h2>
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
                                Save Account
                            </button>
                            <button type="button" onClick={() => setShowAddForm(false)} className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold">
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
                            <button
                                onClick={() => handleDeleteAccount(account.id)}
                                className="p-2 text-gray-400 hover:text-red-600 rounded-lg"
                            >
                                <Trash2 size={18} />
                            </button>
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
        </div>
    );
}
