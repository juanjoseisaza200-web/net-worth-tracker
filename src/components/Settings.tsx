import { User } from 'firebase/auth';
import { RefreshCw, User as UserIcon, Download, Upload, Smartphone, Copy, TrendingUp, ArrowLeftRight } from 'lucide-react';
import { useState, useRef } from 'react';
import { AppData } from '../types';
import { isUsingLiveRates, lastExchangeRatesUpdate, fetchExchangeRates, convertCurrency, formatCurrency } from '../utils/currency';
import { todayLocal } from '../utils/date';
import { migrateData, generateInboxKey, registerInboxKey, unregisterInboxKey } from '../utils/storage';
import { db } from '../firebase';
import { PageTitle, Section, Row, IconSquare, Switch, Segmented } from './ios';
import { ios } from './iosStyles';
import { ThemePref, getThemePref, setThemePref } from '../utils/theme';

interface SettingsProps {
    user: User;
    onLogout: () => void;
    onSync: () => Promise<void>;
    onHardReset?: () => void;
    data: AppData;
    setData: (data: AppData) => void | Promise<void>;
}

export default function Settings({ user, onLogout, onSync, data, setData }: SettingsProps) {
    const [syncing, setSyncing] = useState(false);
    const [fetchingRates, setFetchingRates] = useState(false);
    const [theme, setTheme] = useState<ThemePref>(getThemePref);
    const autoUpdatePrices = data.settings?.autoUpdatePrices ?? true;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const today = todayLocal();
        a.download = `net-worth-backup-${today}.json`;
        // Append to the DOM before clicking and defer the revoke — some mobile
        // browsers won't start the download otherwise.
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            if (!parsed || typeof parsed !== 'object' || !('accounts' in parsed || 'baseCurrency' in parsed)) {
                throw new Error('This does not look like a Net Worth Tracker backup.');
            }
            if (window.confirm('Importing will REPLACE all of your current data with this file. Continue?')) {
                await setData(migrateData(parsed));
                alert('Data imported successfully.');
            }
        } catch (err: any) {
            console.error('Import failed', err);
            alert('Could not import this file: ' + (err.message || 'invalid file.'));
        } finally {
            // Reset so selecting the same file again still fires onChange.
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const inboxKey = data.settings?.inboxKey;
    const [captureBusy, setCaptureBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    // Where the iPhone shortcuts POST: Firestore's REST API, authorised only by
    // the secret key in the path (see the inboxes rules in firestore.rules).
    const { projectId, apiKey } = db.app.options;
    const captureUrl = inboxKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/inboxes/${inboxKey}/items?key=${apiKey}`
        : '';

    const handleEnableCapture = async () => {
        if (inboxKey && !window.confirm('Generate a new key? The shortcuts on your iPhone will stop working until you paste the new URL into them.')) return;
        setCaptureBusy(true);
        try {
            const key = generateInboxKey();
            await registerInboxKey(key, user.uid);
            await setData({ ...data, settings: { ...data.settings, autoUpdatePrices, inboxKey: key } });
            // Best effort: an orphaned old inbox doc is harmless, it just keeps accepting writes nobody reads.
            if (inboxKey) await unregisterInboxKey(inboxKey).catch(err => console.warn('Could not remove old inbox key', err));
        } catch (err: any) {
            console.error('Failed to enable automatic capture', err);
            alert('Could not enable automatic capture: ' + (err.message || 'unknown error'));
        } finally {
            setCaptureBusy(false);
        }
    };

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(captureUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            window.prompt('Copy this URL:', captureUrl);
        }
    };

    const toggleAutoUpdate = () => {
        setData({
            ...data,
            settings: {
                ...data.settings,
                autoUpdatePrices: !autoUpdatePrices,
            },
        });
    };

    const handleSync = async () => {
        setSyncing(true);
        await onSync();
        setTimeout(() => setSyncing(false), 800);
    };

    const handleFetchRates = async () => {
        setFetchingRates(true);
        await fetchExchangeRates();
        setTimeout(() => setFetchingRates(false), 800);
    };

    const handleThemeChange = (pref: ThemePref) => {
        setTheme(pref);
        setThemePref(pref);
    };

    return (
        <div className="px-4 pb-4">
            <PageTitle title="Settings" />

            <div className="space-y-6">
                {/* Profile */}
                <div className={`${ios.card} p-5 flex items-center gap-4`}>
                    {user.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-16 h-16 rounded-full" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-ios-fill flex items-center justify-center text-ios-blue">
                            <UserIcon size={30} />
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="text-ios-title3 font-semibold truncate">{user.displayName || 'User'}</div>
                        <div className="text-ios-subhead text-ios-secondary truncate">{user.email}</div>
                    </div>
                </div>

                <Section title="Appearance" footer="System follows your iPhone's Light/Dark setting. This choice is saved on this device only.">
                    <div className="p-3">
                        <Segmented
                            value={theme}
                            onChange={handleThemeChange}
                            options={[
                                { value: 'system', label: 'System' },
                                { value: 'light', label: 'Light' },
                                { value: 'dark', label: 'Dark' },
                            ]}
                        />
                    </div>
                </Section>

                <Section title="General">
                    <Row
                        icon={<IconSquare icon={TrendingUp} color="var(--ios-green)" />}
                        title="Auto-update Prices"
                        subtitle="Fetch live stock/crypto prices"
                        accessory={<Switch checked={autoUpdatePrices} onChange={toggleAutoUpdate} label="Auto-update Prices" />}
                    />
                    <Row
                        icon={<IconSquare icon={ArrowLeftRight} color={isUsingLiveRates ? 'var(--ios-green)' : 'var(--ios-orange)'} />}
                        title="Exchange Rates"
                        subtitle={
                            <>
                                {/* The rate the app is converting with right now (no extra fetch). */}
                                <div className="truncate tabular-nums text-ios-label">1 USD = {formatCurrency(convertCurrency(1, 'USD', 'COP'), 'COP')}</div>
                                <div className="truncate">
                                    {isUsingLiveRates
                                        ? `Live (Updated ${lastExchangeRatesUpdate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
                                        : 'Using hardcoded fallbacks'}
                                </div>
                            </>
                        }
                        accessory={
                            <button onClick={handleFetchRates} disabled={fetchingRates} className={ios.rowAction} aria-label="Refresh exchange rates">
                                <RefreshCw size={18} className={fetchingRates ? 'animate-spin' : ''} />
                            </button>
                        }
                    />
                    <Row
                        icon={<IconSquare icon={RefreshCw} color="var(--ios-blue)" />}
                        title="Sync Data"
                        subtitle="Force upload local data to cloud"
                        accessory={
                            <button onClick={handleSync} disabled={syncing} className={ios.rowAction} aria-label="Sync data">
                                <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
                            </button>
                        }
                    />
                </Section>

                <Section title="Data">
                    <Row
                        icon={<IconSquare icon={Download} color="var(--ios-indigo)" />}
                        title="Export Data"
                        subtitle="Download a JSON backup of everything"
                        onClick={handleExport}
                    />
                    <Row
                        icon={<IconSquare icon={Upload} color="var(--ios-indigo)" />}
                        title="Import Data"
                        subtitle="Restore from a JSON backup (replaces all data)"
                        onClick={handleImportClick}
                    />
                </Section>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportFile}
                    className="hidden"
                />

                {/* Automatic capture (iPhone shortcuts -> review queue) */}
                <Section
                    title="Automatic Capture"
                    footer={inboxKey
                        ? 'Anyone with this URL can add transactions to your review queue (never read your data) — keep it private.'
                        : 'Apple Pay taps and Bancolombia SMS via iPhone Shortcuts.'}
                >
                    <Row
                        icon={<IconSquare icon={Smartphone} color={inboxKey ? 'var(--ios-green)' : 'var(--ios-gray)'} />}
                        title="Shortcut URL"
                        subtitle={inboxKey ? 'Enabled' : 'Off'}
                        accessory={!inboxKey && (
                            <button
                                onClick={handleEnableCapture}
                                disabled={captureBusy}
                                className="h-8 px-3 rounded-full bg-ios-blue text-white text-ios-subhead font-semibold disabled:opacity-50"
                            >
                                {captureBusy ? 'Enabling…' : 'Enable'}
                            </button>
                        )}
                    />
                    {inboxKey && (
                        <div className="ios-row pl-4">
                            <div className="ios-row-content py-3 pr-4 space-y-3">
                                <div className="flex gap-2">
                                    <input
                                        readOnly
                                        value={captureUrl}
                                        onFocus={(e) => e.target.select()}
                                        className={`${ios.input} flex-1 min-w-0 !text-ios-caption font-mono`}
                                    />
                                    <button
                                        onClick={handleCopyUrl}
                                        className="h-10 px-3 rounded-full bg-ios-blue text-white text-ios-subhead font-semibold flex items-center gap-1 shrink-0"
                                    >
                                        <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                                <button
                                    onClick={handleEnableCapture}
                                    disabled={captureBusy}
                                    className="text-ios-subhead text-ios-red active:opacity-60 disabled:opacity-50"
                                >
                                    Generate a New Key
                                </button>
                            </div>
                        </div>
                    )}
                </Section>

                <Section>
                    <button
                        onClick={onLogout}
                        className="w-full min-h-[44px] text-ios-body text-ios-red active:bg-ios-fill"
                    >
                        Sign Out
                    </button>
                </Section>

                <div className="text-center text-ios-footnote text-ios-tertiary">
                    Net Worth Tracker v1.5.0
                </div>
            </div>
        </div>
    );
}
