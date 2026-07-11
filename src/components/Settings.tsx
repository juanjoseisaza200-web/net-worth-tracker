import { User } from 'firebase/auth';
import { LogOut, RefreshCw, User as UserIcon, ArrowLeft, RefreshCwOff, Download, Upload } from 'lucide-react';
import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AppData } from '../types';
import { isUsingLiveRates, lastExchangeRatesUpdate, fetchExchangeRates } from '../utils/currency';
import { migrateData } from '../utils/storage';

interface SettingsProps {
    user: User;
    onLogout: () => void;
    onSync: () => Promise<void>;
    onHardReset?: () => void;
    data: AppData;
    setData: (data: AppData) => void;
}

export default function Settings({ user, onLogout, onSync, data, setData }: SettingsProps) {
    const [syncing, setSyncing] = useState(false);
    const [fetchingRates, setFetchingRates] = useState(false);
    const autoUpdatePrices = data.settings?.autoUpdatePrices ?? true;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const today = new Date().toISOString().split('T')[0];
        a.download = `net-worth-backup-${today}.json`;
        a.click();
        URL.revokeObjectURL(url);
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
                setData(migrateData(parsed));
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

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <header className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
                <Link to="/" className="text-gray-600 hover:text-gray-900">
                    <ArrowLeft size={24} />
                </Link>
                <h1 className="text-xl font-bold text-gray-800">Settings</h1>
            </header>

            <div className="p-4 max-w-md mx-auto space-y-6">
                {/* Profile Section */}
                <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col items-center">
                    {user.photoURL ? (
                        <img
                            src={user.photoURL}
                            alt="Profile"
                            className="w-20 h-20 rounded-full border-4 border-gray-100 mb-4"
                        />
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
                            <UserIcon size={40} />
                        </div>
                    )}
                    <h2 className="text-lg font-bold text-gray-900">{user.displayName || 'User'}</h2>
                    <p className="text-gray-500">{user.email}</p>
                </div>

                {/* Actions Section */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${autoUpdatePrices ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                {autoUpdatePrices ? <RefreshCw size={20} /> : <RefreshCwOff size={20} />}
                            </div>
                            <div className="text-left">
                                <span className="block font-medium text-gray-900">Auto-update Prices</span>
                                <span className="block text-xs text-gray-500">Fetch live stock/crypto prices</span>
                            </div>
                        </div>
                        <button
                            onClick={toggleAutoUpdate}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${autoUpdatePrices ? 'bg-blue-600' : 'bg-gray-200'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoUpdatePrices ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full bg-blue-50 text-blue-600 ${syncing ? 'animate-spin' : ''}`}>
                                <RefreshCw size={20} />
                            </div>
                            <div className="text-left">
                                <span className="block font-medium text-gray-900">Sync Data</span>
                                <span className="block text-xs text-gray-500">Force upload local data to cloud</span>
                            </div>
                        </div>
                    </button>

                    <button
                        onClick={handleFetchRates}
                        disabled={fetchingRates}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${isUsingLiveRates ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'} ${fetchingRates ? 'animate-spin' : ''}`}>
                                <RefreshCw size={20} />
                            </div>
                            <div className="text-left">
                                <span className="block font-medium text-gray-900">Exchange Rates</span>
                                <span className="block text-xs text-gray-500">
                                    {isUsingLiveRates 
                                        ? `Live (Updated ${lastExchangeRatesUpdate?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})` 
                                        : 'Using hardcoded fallbacks'}
                                </span>
                            </div>
                        </div>
                    </button>

                    <button
                        onClick={handleExport}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-indigo-50 text-indigo-600">
                                <Download size={20} />
                            </div>
                            <div className="text-left">
                                <span className="block font-medium text-gray-900">Export Data</span>
                                <span className="block text-xs text-gray-500">Download a JSON backup of everything</span>
                            </div>
                        </div>
                    </button>

                    <button
                        onClick={handleImportClick}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-indigo-50 text-indigo-600">
                                <Upload size={20} />
                            </div>
                            <div className="text-left">
                                <span className="block font-medium text-gray-900">Import Data</span>
                                <span className="block text-xs text-gray-500">Restore from a JSON backup (replaces all data)</span>
                            </div>
                        </div>
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={handleImportFile}
                        className="hidden"
                    />

                    <button
                        onClick={onLogout}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-red-600"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-full bg-red-50 text-red-600">
                                <LogOut size={20} />
                            </div>
                            <span className="font-medium">Sign Out</span>
                        </div>
                    </button>
                </div>

                <div className="text-center text-xs text-gray-400 mt-8">
                    Net Worth Tracker v1.5.0 - Multi-Account Update 🏦
                </div>
            </div>
        </div>
    );
}
