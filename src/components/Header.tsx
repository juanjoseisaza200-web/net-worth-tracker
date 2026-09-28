import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { User as UserIcon, ChevronLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface HeaderProps {
    user: User;
}

// Each screen draws an iOS large title; once it scrolls away the header shows
// the same title small and centered, like a UINavigationBar.
const INLINE_TITLES: Record<string, string> = {
    '/': 'Net Worth',
    '/accounts': 'Accounts',
    '/expenses': 'Expenses',
    '/debts': 'Reminders',
    '/investments': 'Investments',
    '/settings': 'Settings',
    '/review': 'To Review',
};

// Pushed screens (not tabs): the bar shows a back button instead of the avatar.
const PUSHED = new Set(['/settings', '/review']);

export default function Header({ user }: HeaderProps) {
    const { pathname } = useLocation();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 48);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [pathname]);

    const inlineTitle = INLINE_TITLES[pathname];
    const pushed = PUSHED.has(pathname);

    return (
        <header
            className={`sticky top-0 z-40 h-12 px-4 flex items-center ${pushed ? 'justify-start' : 'justify-end'} transition-colors ${scrolled ? 'ios-material' : ''}`}
            style={{ boxShadow: scrolled ? '0 0.5px 0 var(--ios-separator)' : 'none' }}
        >
            {inlineTitle && (
                <span
                    className={`absolute left-1/2 -translate-x-1/2 text-ios-headline transition-opacity duration-200 ${scrolled ? 'opacity-100' : 'opacity-0'}`}
                    aria-hidden={!scrolled}
                >
                    {inlineTitle}
                </span>
            )}
            {pushed ? (
                <Link to="/" className="flex items-center -ml-2 text-ios-body text-ios-blue active:opacity-60">
                    <ChevronLeft size={26} strokeWidth={2.25} /> Back
                </Link>
            ) : (
            <Link to="/settings" className="active:opacity-60 transition-opacity" aria-label="Settings">
                {user.photoURL ? (
                    <img
                        src={user.photoURL}
                        alt="Profile"
                        className="w-8 h-8 rounded-full"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-ios-fill flex items-center justify-center text-ios-blue">
                        <UserIcon size={18} />
                    </div>
                )}
            </Link>
            )}
        </header>
    );
}
