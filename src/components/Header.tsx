import { User } from 'firebase/auth';
import { User as UserIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface HeaderProps {
    user: User;
}

export default function Header({ user }: HeaderProps) {
    return (
        <header className="px-4 py-3 flex items-center justify-between">
            <Link to="/settings" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                {user.photoURL ? (
                    <img
                        src={user.photoURL}
                        alt="Profile"
                        className="w-10 h-10 rounded-full border border-gray-200"
                    />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <UserIcon size={20} />
                    </div>
                )}
            </Link>
        </header>
    );
}
