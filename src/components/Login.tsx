import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import { LogIn, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export default function Login() {
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async () => {
        setError(null);
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error: any) {
            console.error("Error signing in with Google", error);
            setError(error.message || "Failed to sign in. Please check your connection and try again.");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-ios-bg p-4">
            <div className="bg-ios-card p-8 rounded-ios w-full max-w-md text-center">
                <h1 className="text-ios-title2 font-bold mb-2">Welcome Back!</h1>
                <p className="text-ios-body text-ios-secondary mb-6">Sign in to sync your data across all devices.</p>

                {error && (
                    <div className="mb-4 p-3 bg-ios-fill text-ios-red text-ios-subhead rounded-xl flex items-center gap-2 text-left">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    className="w-full h-12 bg-ios-blue text-white text-ios-headline rounded-full flex items-center justify-center gap-2 active:opacity-80"
                >
                    <LogIn size={20} />
                    Sign in with Google
                </button>
            </div>
        </div>
    );
}
