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
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Welcome Back!</h1>
                <p className="text-gray-600 mb-6">Sign in to sync your data across all devices.</p>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2 text-left">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors duration-200"
                >
                    <LogIn size={20} />
                    Sign in with Google
                </button>
            </div>
        </div>
    );
}
