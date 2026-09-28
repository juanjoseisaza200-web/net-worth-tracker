import { useState } from 'react';
import { Check, Trash2, Smartphone, MessageSquare } from 'lucide-react';
import { AppData } from '../types';
import { PendingEntry } from '../utils/inbox';
import { expenseCategories, incomeCategories } from '../utils/categories';
import { formatCurrency } from '../utils/currency';
import { formatDateForDisplay } from '../utils/date';
import { PageTitle, Segmented } from './ios';
import { ios } from './iosStyles';

interface ReviewProps {
    data: AppData;
    pending: PendingEntry[];
    /** Book `entry` (or only discard when null), then remove the inbox item. */
    onResolve: (itemId: string, entry: PendingEntry | null) => Promise<void>;
}

function PendingCard({ data, entry, onResolve }: { data: AppData; entry: PendingEntry; onResolve: ReviewProps['onResolve'] }) {
    const [form, setForm] = useState({
        kind: entry.kind,
        accountId: entry.accountId,
        category: entry.category,
        description: entry.description,
    });
    const [busy, setBusy] = useState(false);
    const categories = form.kind === 'income' ? incomeCategories : expenseCategories;
    const canSave = form.accountId !== '' && categories.includes(form.category) && form.description.trim() !== '';

    const resolve = async (book: boolean) => {
        if (!book && !window.confirm('Discard this captured transaction? Nothing will be recorded.')) return;
        setBusy(true);
        try {
            await onResolve(entry.itemId, book ? { ...entry, ...form, description: form.description.trim() } : null);
        } catch (err) {
            console.error('Failed to resolve captured transaction', err);
            alert('Could not save. Check your connection and try again.');
            setBusy(false);
        }
    };

    return (
        <div className={`${ios.card} p-4 space-y-3`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className={`font-rounded text-ios-title2 font-bold tabular-nums ${form.kind === 'income' ? 'text-ios-green' : ''}`}>
                        {form.kind === 'income' ? '+' : '−'}{formatCurrency(entry.amount, entry.currency)}
                    </div>
                    <div className="text-ios-footnote text-ios-secondary flex items-center gap-1 mt-0.5">
                        {entry.origin === 'applepay' ? <Smartphone size={12} /> : <MessageSquare size={12} />}
                        {formatDateForDisplay(entry.date)} · {entry.time}
                    </div>
                </div>
                <span className="text-ios-caption font-medium text-ios-orange bg-ios-fill rounded-full px-2.5 py-1 text-right">
                    {entry.reason}
                </span>
            </div>

            <Segmented
                value={form.kind}
                onChange={(kind) => {
                    const list = kind === 'income' ? incomeCategories : expenseCategories;
                    setForm({ ...form, kind, category: list.includes(form.category) ? form.category : '' });
                }}
                options={[
                    { value: 'expense', label: 'Expense' },
                    { value: 'income', label: 'Income' },
                ]}
            />
            <div className="grid grid-cols-2 gap-2">
                <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={ios.select}
                >
                    <option value="">Category…</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                    value={form.accountId}
                    onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                    className={ios.select}
                >
                    <option value="">Account…</option>
                    {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
            </div>
            <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What was it?"
                className={ios.input}
            />

            <div className="flex gap-2">
                <button
                    onClick={() => resolve(true)}
                    disabled={!canSave || busy}
                    className={`${ios.buttonPrimary} flex-1`}
                >
                    <Check size={16} /> Save
                </button>
                <button
                    onClick={() => resolve(false)}
                    disabled={busy}
                    className={ios.buttonDestructive}
                >
                    <Trash2 size={16} /> Discard
                </button>
            </div>
        </div>
    );
}

export default function Review({ data, pending, onResolve }: ReviewProps) {
    return (
        <div className="px-4 pb-4 space-y-4">
            <PageTitle title="To Review" />
            {pending.length === 0 ? (
                <p className="text-center text-ios-secondary py-12">All caught up. Nothing to review.</p>
            ) : (
                <>
                    <p className="px-1 text-ios-subhead text-ios-secondary">
                        Captured automatically but not confirmed. Transfers between your own accounts can be discarded.
                    </p>
                    {pending.map(entry => (
                        <PendingCard key={entry.itemId} data={data} entry={entry} onResolve={onResolve} />
                    ))}
                </>
            )}
        </div>
    );
}
