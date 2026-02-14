import { User } from 'firebase/auth';
import { LogOut, RefreshCw, User as UserIcon } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
    user: User;
    onLogout: () => void;
    onSync: () => Promise<void>;
}

export default function Header({ user, onLogout, onSync }: HeaderProps) {
    const [syncing, setSyncing] = useState(false);

    const handleSync = async () => {
        setSyncing(true);
        await onSync();
        // Simulate a short delay to show the spinner even if sync is instant
        setTimeout(() => setSyncing(false), 500);
    };

    return (
        <header className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
                {user.photoURL ? (
                    <img
                        src={user.photoURL}
                        alt="Profile"
                        className="w-8 h-8 rounded-full border border-gray-200"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <UserIcon size={16} />
                    </div>
                )}
                <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900 leading-tight">
                        {user.displayName || 'User'}
                    </span>
                    <span className="text-xs text-gray-500 leading-tight">
                        {user.email}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    className={`p-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors ${syncing ? 'animate-spin text-blue-600' : ''}`}
                    title="Sync Now"
                >
                    <RefreshCw size={18} />
                </button>
                <button
                    onClick={onLogout}
                    className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-red-600 transition-colors"
                    title="Sign Out"
                >
                    <LogOut size={18} />
                </button>
            </div>
        </header>
    );
}
