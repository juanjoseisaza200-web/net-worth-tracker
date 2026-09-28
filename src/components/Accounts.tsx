import { useEffect, useRef, useState } from 'react';
import { Plus, Wallet, ArrowRightLeft, Trash2, CreditCard, Landmark, PiggyBank, Banknote, Repeat } from 'lucide-react';
import { AppData, Account, AccountType, Currency, Automation, ActivityLog, Income } from '../types';
import { formatCurrency, formatCurrencyTrimmed, formatCompactCurrency, convertCurrency } from '../utils/currency';
import { parseAmount, groupThousands, ungroupTyped, toEditableAmount } from '../utils/number';
import { resolveEditedBalance } from '../utils/sync';
import { formatDateForDisplay, getOrdinalSuffix } from '../utils/date';
import { DEFAULT_STATEMENT_DAY, getCardStatement, sumCardPayments, sumInCurrency } from '../utils/creditCard';
import CurrencySelect from './CurrencySelect';
import { Section, Row, IconSquare, PageTitle, Segmented } from './ios';
import { ios } from './iosStyles';

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

// Same icon/color per account type as the Dashboard's Accounts list.
const ACCOUNT_ICONS: Record<AccountType, { icon: typeof Landmark; color: string }> = {
    checking: { icon: Landmark, color: 'var(--ios-blue)' },
    savings: { icon: PiggyBank, color: 'var(--ios-green)' },
    cash: { icon: Banknote, color: 'var(--ios-teal)' },
    credit: { icon: CreditCard, color: 'var(--ios-orange)' },
    other: { icon: Wallet, color: 'var(--ios-gray)' },
};

/** Sentinel for "somebody else paid this" in the payment form's source select. */
const EXTERNAL_PAYER = 'external';

export default function Accounts({ data, setData, baseCurrency, onCurrencyChange }: AccountsProps) {
    const [viewMode, setViewMode] = useState<'accounts' | 'automations'>('accounts');
    const [showAddForm, setShowAddForm] = useState(false);
    const [showTransferForm, setShowTransferForm] = useState(false);
    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
    // Balance field as it was when the edit form opened (see resolveEditedBalance).
    const [balanceAtOpen, setBalanceAtOpen] = useState('');

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
        currency: 'COP' as Currency,
        balance: '',
        statementDay: DEFAULT_STATEMENT_DAY,
        paymentDueDate: '',
        matchKeys: '',
    });

    const [transferForm, setTransferForm] = useState({
        fromAccountId: '',
        toAccountId: '',
        amount: '',
    });

    const [payingCardId, setPayingCardId] = useState<string | null>(null);
    const accountFormRef = useRef<HTMLDivElement>(null);
    const automationFormRef = useRef<HTMLDivElement>(null);

    // Rows are tapped far down the list, but the edit forms render above it:
    // bring the form into view whenever an account or automation is opened.
    useEffect(() => {
        if (editingAccountId) accountFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [editingAccountId]);
    useEffect(() => {
        if (editingAutomationId) automationFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [editingAutomationId]);
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        sourceAccountId: '',
        recordAsIncome: true,
    });

    const emptyAddForm = {
        name: '',
        type: 'checking' as AccountType,
        currency: 'COP' as Currency,
        balance: '',
        statementDay: DEFAULT_STATEMENT_DAY,
        paymentDueDate: '',
        matchKeys: '',
    };

    const accounts = data.accounts || [];

    // Deleting from the edit form removes the account; close the now-stale form.
    const editedAccountExists = !editingAccountId || accounts.some(a => a.id === editingAccountId);
    useEffect(() => {
        if (!editedAccountExists) {
            setEditingAccountId(null);
            setShowAddForm(false);
        }
    }, [editedAccountExists]);

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
        const matchKeys = addForm.matchKeys.split(',').map(k => k.trim()).filter(Boolean);

        if (editingAccountId) {
            const updatedAccounts = accounts.map(acc =>
                acc.id === editingAccountId
                    ? {
                        ...acc,
                        name: addForm.name,
                        type: addForm.type,
                        currency: addForm.currency,
                        // Untouched field keeps the CURRENT balance, not the one
                        // captured when the form opened.
                        balance: resolveEditedBalance({
                            current: acc.balance,
                            typed: addForm.balance,
                            typedAtOpen: balanceAtOpen,
                            isCredit,
                        }),
                        ...creditFields,
                        matchKeys,
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
                matchKeys,
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
        // Cards are edited as the positive amount owed, matching how they're added.
        const balanceField = toEditableAmount(account.type === 'credit' ? Math.abs(account.balance) : account.balance);
        setEditingAccountId(account.id);
        setBalanceAtOpen(balanceField);
        setAddForm({
            name: account.name,
            type: account.type,
            currency: account.currency,
            balance: balanceField,
            statementDay: account.statementDay ?? DEFAULT_STATEMENT_DAY,
            paymentDueDate: account.paymentDueDate || '',
            matchKeys: (account.matchKeys || []).join(', '),
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

    const renderAccount = (account: Account) => {
        const isCredit = account.type === 'credit';
        const statement = isCredit
            ? getCardStatement(data.expenses, account.id, account.statementDay ?? DEFAULT_STATEMENT_DAY, new Date())
            : null;
        // Payments made after the cutoff are paying off the statement
        // that closed on it, so they net against the billed total.
        const billed = statement ? sumInCurrency(statement.billed, account.currency) : 0;
        const paid = statement ? sumCardPayments(data.activityLogs, account.id, statement.currentStart, account.currency) : 0;
        const running = statement ? sumInCurrency(statement.current, account.currency) : 0;
        const { icon, color } = ACCOUNT_ICONS[account.type] || ACCOUNT_ICONS.other;
        const converted = account.currency !== baseCurrency
            ? `≈ ${formatCurrency(convertCurrency(account.balance, account.currency, baseCurrency), baseCurrency)}`
            : null;

        return (
            <div key={account.id} className="ios-row">
                <Row
                    icon={<IconSquare icon={icon} color={color} />}
                    onClick={() => handleEditAccount(account)}
                    title={account.name}
                    subtitle={accountTypes.find(t => t.value === account.type)?.label || account.type}
                    value={isCredit
                        ? <span className="text-ios-red">{formatCurrencyTrimmed(Math.max(0, -account.balance), account.currency)}</span>
                        : formatCurrencyTrimmed(account.balance, account.currency)}
                    detail={isCredit || converted
                        ? <>
                            {isCredit && <div>Total owed</div>}
                            {converted && <div className="tabular-nums">{converted}</div>}
                          </>
                        : undefined}
                />

                {isCredit && statement && (
                    <div className="pl-[58px] pr-4 pb-3 space-y-3">
                        <div className="p-3 rounded-xl bg-ios-fill text-ios-footnote tabular-nums">
                            <div className="flex justify-between gap-3">
                                <span className="text-ios-secondary">
                                    Statement closed {formatDateForDisplay(statement.lastCutoff)}
                                </span>
                                <span className="text-ios-label">{formatCurrency(billed, account.currency)}</span>
                            </div>
                            {paid > 0 && (
                                <>
                                    <div className="flex justify-between gap-3 mt-1">
                                        <span className="text-ios-secondary">Paid since then</span>
                                        <span className="text-ios-green">−{formatCurrency(paid, account.currency)}</span>
                                    </div>
                                    <div className="flex justify-between gap-3 mt-1 pt-1 border-t-[0.5px] border-ios-separator">
                                        <span className="text-ios-label font-medium">Left on this statement</span>
                                        <span className="text-ios-label font-semibold">
                                            {formatCurrency(Math.max(0, billed - paid), account.currency)}
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="flex justify-between gap-3 mt-2 pt-2 border-t-[0.5px] border-ios-separator">
                                <span className="text-ios-secondary">
                                    Current cycle (since {formatDateForDisplay(statement.currentStart)})
                                </span>
                                <span className="text-ios-label">{formatCurrency(running, account.currency)}</span>
                            </div>
                            <div className="mt-2 text-ios-caption text-ios-secondary">
                                {account.paymentDueDate
                                    ? `Due ${formatDateForDisplay(account.paymentDueDate)}`
                                    : 'No due date set — edit the account to add it.'}
                            </div>
                        </div>

                        {payingCardId === account.id ? (
                            <form onSubmit={handleCardPayment} className="space-y-3">
                                <div>
                                    <label className={ios.label}>
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
                                        className={ios.input}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className={ios.label}>Paid from</label>
                                    <select
                                        required
                                        value={paymentForm.sourceAccountId}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, sourceAccountId: e.target.value })}
                                        className={ios.select}
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
                                    <label className="flex items-start gap-2 px-1 text-ios-subhead text-ios-label">
                                        <input
                                            type="checkbox"
                                            checked={paymentForm.recordAsIncome}
                                            onChange={(e) => setPaymentForm({ ...paymentForm, recordAsIncome: e.target.checked })}
                                            className="mt-0.5 w-4 h-4 accent-ios-green"
                                        />
                                        <span>
                                            Record as income
                                            <span className="block text-ios-footnote text-ios-secondary">
                                                Your net worth goes up when someone else pays. Logging it keeps that visible.
                                            </span>
                                        </span>
                                    </label>
                                )}
                                <div className="flex gap-2">
                                    <button type="submit" className={`${ios.buttonPrimary} flex-1`}>
                                        Record Payment
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPayingCardId(null)}
                                        className={`${ios.buttonSecondary} flex-1`}
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
                                className={`${ios.buttonSecondary} w-full h-9 text-ios-subhead font-semibold`}
                            >
                                Pay Card
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const cashAccounts = accounts.filter(a => a.type !== 'credit');
    const creditAccounts = accounts.filter(a => a.type === 'credit');

    return (
        <div className="px-4 pb-4">
            <PageTitle title={viewMode === 'accounts' ? 'Accounts' : 'Automations'}>
                {viewMode === 'accounts' && (
                    <CurrencySelect
                        value={baseCurrency}
                        onChange={onCurrencyChange}
                        aria-label="View currency"
                        className={ios.pillSelect}
                    />
                )}
            </PageTitle>

            <div className="mb-5">
                <Segmented
                    options={[
                        { value: 'accounts', label: 'Accounts' },
                        { value: 'automations', label: 'Automations' },
                    ]}
                    value={viewMode}
                    onChange={setViewMode}
                />
            </div>

            {viewMode === 'automations' && (
                <div className="space-y-6">
                    <p className="px-1 text-ios-subhead text-ios-secondary">
                        Set up automated transfers between your accounts to manage your budget effortlessly.
                    </p>

                    {/* Automations Actions */}
                    <button
                        onClick={() => {
                            setEditingAutomationId(null);
                            setAutomationForm({
                                name: '', type: 'transfer', sourceAccountId: '', destinationAccountId: '',
                                amount: '', keepAmount: '', dayOfMonth: 15, isActive: true
                            });
                            setShowAutomationForm(true);
                        }}
                        className={`${ios.buttonPrimary} w-full`}
                    >
                        <Plus size={20} /> Add Automation
                    </button>

                    {/* Automation Form */}
                    {showAutomationForm && (
                        <div ref={automationFormRef} className={`${ios.card} p-4 scroll-mt-16`}>
                            <h2 className="text-ios-headline mb-4 px-1">{editingAutomationId ? 'Edit Automation' : 'New Automation'}</h2>
                            <form onSubmit={handleAutomationSubmit} className="space-y-4">
                                <div>
                                    <label className={ios.label}>Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={automationForm.name}
                                        onChange={(e) => setAutomationForm({ ...automationForm, name: e.target.value })}
                                        className={ios.input}
                                        placeholder="e.g. Savings Sweep"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={ios.label}>Type</label>
                                        <select
                                            value={automationForm.type}
                                            onChange={(e) => setAutomationForm({ ...automationForm, type: e.target.value as 'sweep' | 'transfer' })}
                                            className={ios.select}
                                        >
                                            <option value="transfer">Fixed Transfer</option>
                                            <option value="sweep">Balance Sweep</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={ios.label}>Day of Month</label>
                                        <select
                                            value={automationForm.dayOfMonth}
                                            onChange={(e) => setAutomationForm({ ...automationForm, dayOfMonth: parseInt(e.target.value) })}
                                            className={ios.select}
                                        >
                                            <option value={0}>End of Month</option>
                                            {Array.from({length: 28}, (_, i) => i + 1).map(day => (
                                                <option key={day} value={day}>{day}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={ios.label}>From Account</label>
                                        <select
                                            required
                                            value={automationForm.sourceAccountId}
                                            onChange={(e) => setAutomationForm({ ...automationForm, sourceAccountId: e.target.value })}
                                            className={ios.select}
                                        >
                                            <option value="" disabled>Select</option>
                                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={ios.label}>To Account</label>
                                        <select
                                            required
                                            value={automationForm.destinationAccountId}
                                            onChange={(e) => setAutomationForm({ ...automationForm, destinationAccountId: e.target.value })}
                                            className={ios.select}
                                        >
                                            <option value="" disabled>Select</option>
                                            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {automationForm.type === 'transfer' ? (
                                    <div>
                                        <label className={ios.label}>Transfer Amount</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            required
                                            value={automationForm.amount}
                                            onChange={(e) => setAutomationForm({ ...automationForm, amount: e.target.value.replace(',', '.') })}
                                            className={ios.input}
                                            placeholder="735000"
                                        />
                                    </div>
                                ) : (
                                    <div>
                                        <label className={ios.label}>Keep Amount in Source Account</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            required
                                            value={automationForm.keepAmount}
                                            onChange={(e) => setAutomationForm({ ...automationForm, keepAmount: e.target.value.replace(',', '.') })}
                                            className={ios.input}
                                            placeholder="7500"
                                        />
                                    </div>
                                )}
                                <div className="flex items-center gap-2 px-1">
                                    <input
                                        type="checkbox"
                                        checked={automationForm.isActive}
                                        onChange={(e) => setAutomationForm({ ...automationForm, isActive: e.target.checked })}
                                        className="w-4 h-4 accent-ios-green"
                                    />
                                    <label className="text-ios-subhead text-ios-label">Automation is Active</label>
                                </div>
                                <div className="flex gap-2">
                                    <button type="submit" className={`${ios.buttonPrimary} flex-1`}>Save</button>
                                    <button type="button" onClick={() => setShowAutomationForm(false)} className={`${ios.buttonSecondary} flex-1`}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Automations List */}
                    <Section title="Automations">
                        {(data.automations || []).map(automation => {
                            const sourceAcc = accounts.find(a => a.id === automation.sourceAccountId);
                            const destAcc = accounts.find(a => a.id === automation.destinationAccountId);
                            return (
                                <div key={automation.id} className="ios-row">
                                    <Row
                                        onClick={() => handleEditAutomation(automation)}
                                        icon={<IconSquare icon={Repeat} color={automation.isActive ? 'var(--ios-indigo)' : 'var(--ios-gray)'} />}
                                        title={automation.name}
                                        subtitle={automation.dayOfMonth === 0 ? 'End of month' : `On the ${automation.dayOfMonth}${getOrdinalSuffix(automation.dayOfMonth)}`}
                                        accessory={
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button onClick={() => handleDeleteAutomation(automation.id)} className={ios.rowActionDestructive} aria-label="Delete automation">
                                                    <Trash2 size={17} />
                                                </button>
                                            </div>
                                        }
                                    />
                                    <div className="pl-[58px] pr-4 pb-3 -mt-1 space-y-0.5">
                                        <div className="text-ios-subhead text-ios-label">
                                            {sourceAcc?.name || 'Unknown'} <ArrowRightLeft size={13} className="inline mx-1 text-ios-tertiary" /> {destAcc?.name || 'Unknown'}
                                        </div>
                                        <div className="text-ios-footnote text-ios-secondary tabular-nums">
                                            {automation.type === 'transfer'
                                                ? `Transfer fixed amount: ${formatCurrency(automation.amount || 0, sourceAcc?.currency || 'USD')}`
                                                : `Sweep all except ${formatCurrency(automation.keepAmount || 0, sourceAcc?.currency || 'USD')}`}
                                        </div>
                                        <div className="text-ios-footnote text-ios-secondary">
                                            <span className={`font-semibold ${automation.isActive ? 'text-ios-green' : 'text-ios-secondary'}`}>
                                                {automation.isActive ? 'Active' : 'Paused'}
                                            </span>
                                            {' · '}
                                            Last run: {automation.lastRunMonth || 'Never'}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {(!data.automations || data.automations.length === 0) && (
                            <div className="text-center py-6 text-ios-subhead text-ios-secondary">No automations configured yet.</div>
                        )}
                    </Section>
                </div>
            )}

            {viewMode === 'accounts' && (
                <div className="space-y-6">
                    <div className="px-1">
                        <div className="text-ios-footnote uppercase text-ios-secondary">Total Liquid Cash</div>
                        <div className="mt-0.5 font-rounded text-[40px] leading-[48px] font-bold tabular-nums tracking-tight truncate">
                            {formatCompactCurrency(totalCashBaseCurrency, baseCurrency)}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setEditingAccountId(null);
                                setAddForm(emptyAddForm);
                                setShowAddForm(true);
                                setShowTransferForm(false);
                            }}
                            className={`${ios.buttonPrimary} flex-1 px-3`}
                        >
                            <Plus size={20} /> Add Account
                        </button>
                        <button
                            onClick={() => { setShowTransferForm(true); setShowAddForm(false); }}
                            className={`${ios.buttonSecondary} flex-1 px-3`}
                        >
                            <ArrowRightLeft size={20} /> Transfer
                        </button>
                    </div>

                    {/* Add/Edit Form */}
                    {showAddForm && (
                        <div ref={accountFormRef} className={`${ios.card} p-4 scroll-mt-16`}>
                            <h2 className="text-ios-headline mb-4 px-1">{editingAccountId ? 'Edit Account' : 'Add New Account'}</h2>
                            <form onSubmit={handleAddSubmit} className="space-y-4">
                                <div>
                                    <label className={ios.label}>Account Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={addForm.name}
                                        onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                                        className={ios.input}
                                        placeholder="e.g. Chase Checkings"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={ios.label}>Type</label>
                                        <select
                                            value={addForm.type}
                                            onChange={(e) => setAddForm({ ...addForm, type: e.target.value as AccountType })}
                                            className={ios.select}
                                        >
                                            {accountTypes.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={ios.label}>Currency</label>
                                        <CurrencySelect
                                            value={addForm.currency}
                                            onChange={(c) => setAddForm({ ...addForm, currency: c })}
                                            className={ios.select}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className={ios.label}>
                                        {addForm.type === 'credit' ? 'Amount Currently Owed' : 'Initial Balance'}
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        lang="en-US"
                                        required
                                        value={groupThousands(addForm.balance)}
                                        onChange={(e) => {
                                            // Shown with thousands separators; stored raw ("5305255.75").
                                            const val = ungroupTyped(e.target.value, (e.nativeEvent as InputEvent).inputType?.startsWith('delete'));
                                            if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                setAddForm({ ...addForm, balance: val });
                                            }
                                        }}
                                        className={ios.input}
                                        placeholder="0.00"
                                    />
                                    {addForm.type === 'credit' && (
                                        <p className={ios.hint}>
                                            Enter your debt as a positive number. It counts against your net worth.
                                        </p>
                                    )}
                                </div>
                                {addForm.type === 'credit' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={ios.label}>Statement Closes On</label>
                                            <select
                                                value={addForm.statementDay}
                                                onChange={(e) => setAddForm({ ...addForm, statementDay: parseInt(e.target.value) })}
                                                className={ios.select}
                                            >
                                                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                                                    <option key={d} value={d}>Day {d}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={ios.label}>Payment Due</label>
                                            <input
                                                type="date"
                                                value={addForm.paymentDueDate}
                                                onChange={(e) => setAddForm({ ...addForm, paymentDueDate: e.target.value })}
                                                className={ios.input}
                                            />
                                            <p className={ios.hint}>Update each cycle — issuers shift this date.</p>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <label className={ios.label}>Auto-capture identifiers</label>
                                    <input
                                        type="text"
                                        value={addForm.matchKeys}
                                        onChange={(e) => setAddForm({ ...addForm, matchKeys: e.target.value })}
                                        className={ios.input}
                                        placeholder="e.g. 1342, Black Mastercard"
                                    />
                                    <p className={ios.hint}>
                                        Comma-separated: last 4 digits from bank SMS (card and account) and the card name in Apple Wallet.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button type="submit" className={`${ios.buttonPrimary} flex-1 px-3`}>
                                        {editingAccountId ? 'Save' : 'Add'}
                                    </button>
                                    <button type="button" onClick={() => { setShowAddForm(false); setEditingAccountId(null); }} className={`${ios.buttonSecondary} flex-1 px-3`}>
                                        Cancel
                                    </button>
                                </div>
                                {editingAccountId && (
                                    <button type="button" onClick={() => handleDeleteAccount(editingAccountId)} className={`${ios.buttonDestructive} w-full`}>
                                        Delete Account
                                    </button>
                                )}
                            </form>
                        </div>
                    )}

                    {/* Transfer Form */}
                    {showTransferForm && (
                        <div className={`${ios.card} p-4`}>
                            <h2 className="text-ios-headline mb-4 px-1">Transfer Funds</h2>
                            <form onSubmit={handleTransferSubmit} className="space-y-4">
                                <div>
                                    <label className={ios.label}>From Account</label>
                                    <select
                                        required
                                        value={transferForm.fromAccountId}
                                        onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })}
                                        className={ios.select}
                                    >
                                        <option value="" disabled>Select Source</option>
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance, acc.currency)})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={ios.label}>To Account</label>
                                    <select
                                        required
                                        value={transferForm.toAccountId}
                                        onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}
                                        className={ios.select}
                                    >
                                        <option value="" disabled>Select Destination</option>
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance, acc.currency)})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={ios.label}>
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
                                        className={ios.input}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button type="submit" className={`${ios.buttonPrimary} flex-1`}>
                                        Transfer
                                    </button>
                                    <button type="button" onClick={() => setShowTransferForm(false)} className={`${ios.buttonSecondary} flex-1`}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Account List */}
                    {accounts.length === 0 ? (
                        <Section title="Accounts">
                            <div className="text-center py-6 text-ios-subhead text-ios-secondary">
                                No accounts added yet.
                            </div>
                        </Section>
                    ) : (
                        <>
                            {cashAccounts.length > 0 && (
                                <Section title="Cash & Bank">
                                    {cashAccounts.map(renderAccount)}
                                </Section>
                            )}
                            {creditAccounts.length > 0 && (
                                <Section title="Credit Cards">
                                    {creditAccounts.map(renderAccount)}
                                </Section>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
