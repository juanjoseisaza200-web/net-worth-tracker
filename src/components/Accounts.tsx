import { useState } from 'react';
import { Plus, Wallet, ArrowRightLeft, Building2, Trash2, Edit2, Settings2, CreditCard } from 'lucide-react';
import { AppData, Account, AccountType, Currency, Automation, ActivityLog, Income } from '../types';
import { formatCurrency, formatCompactCurrency, convertCurrency } from '../utils/currency';
import { parseAmount } from '../utils/number';
import { formatDateForDisplay } from '../utils/date';
import { DEFAULT_STATEMENT_DAY, getCardStatement, sumCardPayments, sumInCurrency } from '../utils/creditCard';
import CurrencySelect from './CurrencySelect';

interface AccountsProps {
    data: AppData;
    setData: (data: AppData) => void;
    baseCurrency: Currency;
    onCurrencyChange: (currency: Currency) => void;
}

const accountTypes: { value: AccountType; label: string }[] = [
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' },
    { value: 'cash', label: 'Cash' },
    { value: 'credit', label: 'Credit Card' },
    { value: 'other', label: 'Other' },
];

/** Sentinel for "somebody else paid this" in the payment form's source select. */
const EXTERNAL_PAYER = 'external';

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
        statementDay: DEFAULT_STATEMENT_DAY,
        paymentDueDate: '',
    });

    const [transferForm, setTransferForm] = useState({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
    });

    const [payingCardId, setPayingCardId] = useState<string | null>(null);
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        sourceAccountId: '',
        recordAsIncome: true,
    });

    const emptyAddForm = {
        name: '',
        type: 'checking' as AccountType,
        currency: 'USD' as Currency,
        balance: '',
        statementDay: DEFAULT_STATEMENT_DAY,
        paymentDueDate: '',
    };

    const accounts = data.accounts || [];

    const handleAddSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const isCredit = addForm.type === 'credit';
        const entered = parseAmount(addForm.balance) ?? 0;
        // A card is entered as "what I owe" (a positive number) but stored as a
        // negative balance, so net worth and transfers need no special casing.
        const balance = isCredit ? -Math.abs(entered) : entered;
        // Spread in conditionally: Firestore rejects `undefined`, and non-credit
        // accounts have no business carrying statement fields.
        const creditFields = isCredit
            ? { statementDay: addForm.statementDay, paymentDueDate: addForm.paymentDueDate }
            : {};

        if (editingAccountId) {
            const updatedAccounts = accounts.map(acc =>
                acc.id === editingAccountId
                    ? {
                        ...acc,
                        name: addForm.name,
                        type: addForm.type,
                        currency: addForm.currency,
                        balance,
                        ...creditFields,
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
                balance,
                ...creditFields,
            };

            setData({
                ...data,
                accounts: [...accounts, newAccount],
            });
        }

        setAddForm(emptyAddForm);
        setShowAddForm(false);
    };

    /**
     * Pay down a card. The amount is expressed in the card's currency (what
     * actually comes off the debt); a source account in another currency is
     * debited the converted equivalent. Choosing EXTERNAL_PAYER means someone
     * else paid — the debt drops and none of our accounts move, which is a real
     * increase in net worth, so it can optionally be booked as income too.
     */
    const handleCardPayment = (e: React.FormEvent) => {
        e.preventDefault();

        const card = accounts.find(a => a.id === payingCardId);
        if (!card) return;

        const amount = parseAmount(paymentForm.amount);
        if (amount === null || amount <= 0) {
            alert('Please enter a valid amount greater than 0.');
            return;
        }

        const isExternal = paymentForm.sourceAccountId === EXTERNAL_PAYER;
        const source = isExternal ? null : accounts.find(a => a.id === paymentForm.sourceAccountId);
        if (!isExternal && !source) {
            alert('Please choose where the payment comes from.');
            return;
        }

        const newAccounts = accounts.map(acc => {
            if (acc.id === card.id) {
                // Debt is negative, so paying moves the balance up towards zero.
                return { ...acc, balance: acc.balance + amount };
            }
            if (source && acc.id === source.id) {
                return { ...acc, balance: acc.balance - convertCurrency(amount, card.currency, acc.currency) };
            }
            return acc;
        });

        const log: ActivityLog = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            description: isExternal
                ? `Card payment (paid externally): ${card.name}`
                : `Card payment: ${source!.name} to ${card.name}`,
            amount,
            currency: card.currency,
            destinationAccountId: card.id,
            type: 'cardPayment',
        };
        if (source) log.sourceAccountId = source.id;

        const newData: AppData = {
            ...data,
            accounts: newAccounts,
            activityLogs: [...(data.activityLogs || []), log],
        };

        if (isExternal && paymentForm.recordAsIncome) {
            const today = new Date();
            const income: Income = {
                id: Date.now().toString() + '-income',
                amount,
                currency: card.currency,
                description: `Card payment by someone else: ${card.name}`,
                category: 'Other',
                date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
                // Booked against the card because that's where the money landed;
                // the balance change above is the only one — this record is for
                // reporting, it doesn't move a balance a second time.
                accountId: card.id,
            };
            newData.incomes = [...data.incomes, income];
        }

        setData(newData);
        setPaymentForm({ amount: '', sourceAccountId: '', recordAsIncome: true });
        setPayingCardId(null);
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
        // Block deletion if anything still references this account, otherwise we'd
        // orphan the reference: an automation would fire against a non-existent
        // account, and recurring incomes / linked fixed income would dangle.
        const hasExpenses = data.expenses.some(e => e.accountId === id);
        const hasIncomes = data.incomes.some(i => i.accountId === id);
        const hasRecurring = (data.recurringIncomes || []).some(r => r.accountId === id);
        const hasAutomations = (data.automations || []).some(
            a => a.sourceAccountId === id || a.destinationAccountId === id
        );
        const hasLinkedFixed = (data.fixedIncome || []).some(f => f.linkedAccountId === id);

        if (hasExpenses || hasIncomes || hasRecurring || hasAutomations || hasLinkedFixed) {
            const linked = [
                hasExpenses && 'expenses',
                hasIncomes && 'incomes',
                hasRecurring && 'recurring incomes',
                hasAutomations && 'automations',
                hasLinkedFixed && 'linked fixed income',
            ].filter(Boolean).join(', ');
            alert(`Cannot delete an account that still has ${linked} attached to it. Please reassign or remove them first.`);
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
            // Cards are edited as the positive amount owed, matching how they're added.
            balance: (account.type === 'credit' ? Math.abs(account.balance) : account.balance).toString(),
            statementDay: account.statementDay ?? DEFAULT_STATEMENT_DAY,
            paymentDueDate: account.paymentDueDate || '',
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
            const parsedAmount = parseAmount(automationForm.amount);
            if (parsedAmount === null || parsedAmount <= 0) {
                alert('Please enter a valid transfer amount greater than 0.');
                return;
            }
            newAutomation.amount = parsedAmount;
        } else if (automationForm.type === 'sweep') {
            newAutomation.keepAmount = parseAmount(automationForm.keepAmount) ?? 0;
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
                        <CurrencySelect
                            value={baseCurrency}
                            onChange={onCurrencyChange}
                            className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium"
                        />
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
                        setAddForm(emptyAddForm);
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
                                <CurrencySelect
                                    value={addForm.currency}
                                    onChange={(c) => setAddForm({ ...addForm, currency: c })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {addForm.type === 'credit' ? 'Amount Currently Owed' : 'Initial Balance'}
                            </label>
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
                            {addForm.type === 'credit' && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Enter your debt as a positive number. It counts against your net worth.
                                </p>
                            )}
                        </div>
                        {addForm.type === 'credit' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Statement Closes On</label>
                                    <select
                                        value={addForm.statementDay}
                                        onChange={(e) => setAddForm({ ...addForm, statementDay: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                            <option key={d} value={d}>Day {d}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Due</label>
                                    <input
                                        type="date"
                                        value={addForm.paymentDueDate}
                                        onChange={(e) => setAddForm({ ...addForm, paymentDueDate: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">Update each cycle — issuers shift this date.</p>
                                </div>
                            </div>
                        )}
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
                {accounts.map(account => {
                    const isCredit = account.type === 'credit';
                    const statement = isCredit
                        ? getCardStatement(data.expenses, account.id, account.statementDay ?? DEFAULT_STATEMENT_DAY, new Date())
                        : null;
                    // Payments made after the cutoff are paying off the statement
                    // that closed on it, so they net against the billed total.
                    const billed = statement ? sumInCurrency(statement.billed, account.currency) : 0;
                    const paid = statement ? sumCardPayments(data.activityLogs, account.id, statement.currentStart, account.currency) : 0;
                    const running = statement ? sumInCurrency(statement.current, account.currency) : 0;

                    return (
                    <div key={account.id} className="bg-white rounded-lg shadow p-4">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <div className={`p-2 rounded-lg ${isCredit ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                    {isCredit
                                        ? <CreditCard size={20} />
                                        : account.type === 'checking' || account.type === 'savings' ? <Building2 size={20} /> : <Wallet size={20} />}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-800">{account.name}</h3>
                                    <div className="text-sm text-gray-500">
                                        {accountTypes.find(t => t.value === account.type)?.label || account.type}
                                    </div>
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
                            {isCredit ? (
                                <>
                                    <div className="text-sm text-gray-500">Total owed</div>
                                    <div className="text-2xl font-bold text-red-600">
                                        {formatCurrency(Math.max(0, -account.balance), account.currency)}
                                    </div>
                                </>
                            ) : (
                                <div className="text-2xl font-bold text-gray-900">
                                    {formatCurrency(account.balance, account.currency)}
                                </div>
                            )}
                            {account.currency !== baseCurrency && (
                                <div className="text-sm text-gray-500">
                                    ≈ {formatCurrency(convertCurrency(account.balance, account.currency, baseCurrency), baseCurrency)}
                                </div>
                            )}
                        </div>

                        {isCredit && statement && (
                            <div className="mt-4 space-y-3">
                                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">
                                            Statement closed {formatDateForDisplay(statement.lastCutoff)}
                                        </span>
                                        <span className="font-medium text-gray-800">{formatCurrency(billed, account.currency)}</span>
                                    </div>
                                    {paid > 0 && (
                                        <>
                                            <div className="flex justify-between text-sm mt-1">
                                                <span className="text-gray-600">Paid since then</span>
                                                <span className="font-medium text-green-600">−{formatCurrency(paid, account.currency)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm mt-1 pt-1 border-t border-gray-200">
                                                <span className="text-gray-700 font-medium">Left on this statement</span>
                                                <span className="font-semibold text-gray-900">
                                                    {formatCurrency(Math.max(0, billed - paid), account.currency)}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-200">
                                        <span className="text-gray-600">
                                            Current cycle (since {formatDateForDisplay(statement.currentStart)})
                                        </span>
                                        <span className="font-medium text-gray-800">{formatCurrency(running, account.currency)}</span>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500">
                                        {account.paymentDueDate
                                            ? `Due ${formatDateForDisplay(account.paymentDueDate)}`
                                            : 'No due date set — edit the account to add it.'}
                                    </div>
                                </div>

                                {payingCardId === account.id ? (
                                    <form onSubmit={handleCardPayment} className="p-3 bg-white border border-gray-200 rounded-lg space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Amount ({account.currency})
                                            </label>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                lang="en-US"
                                                required
                                                autoFocus
                                                value={paymentForm.amount}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(',', '.');
                                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                        setPaymentForm({ ...paymentForm, amount: val });
                                                    }
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Paid from</label>
                                            <select
                                                required
                                                value={paymentForm.sourceAccountId}
                                                onChange={(e) => setPaymentForm({ ...paymentForm, sourceAccountId: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            >
                                                <option value="">Select source...</option>
                                                {accounts.filter(a => a.type !== 'credit').map(a => (
                                                    <option key={a.id} value={a.id}>
                                                        {a.name} ({formatCurrency(a.balance, a.currency)})
                                                    </option>
                                                ))}
                                                <option value={EXTERNAL_PAYER}>Someone else paid</option>
                                            </select>
                                        </div>
                                        {paymentForm.sourceAccountId === EXTERNAL_PAYER && (
                                            <label className="flex items-start gap-2 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={paymentForm.recordAsIncome}
                                                    onChange={(e) => setPaymentForm({ ...paymentForm, recordAsIncome: e.target.checked })}
                                                    className="mt-0.5"
                                                />
                                                <span>
                                                    Record as income
                                                    <span className="block text-xs text-gray-500">
                                                        Your net worth goes up when someone else pays. Logging it keeps that visible.
                                                    </span>
                                                </span>
                                            </label>
                                        )}
                                        <div className="flex gap-2">
                                            <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold">
                                                Record Payment
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPayingCardId(null)}
                                                className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <button
                                        onClick={() => {
                                            setPaymentForm({ amount: '', sourceAccountId: '', recordAsIncome: true });
                                            setPayingCardId(account.id);
                                        }}
                                        className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold"
                                    >
                                        Pay Card
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    );
                })}
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
