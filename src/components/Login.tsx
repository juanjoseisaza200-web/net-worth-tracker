import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import { LogIn } from 'lucide-react';

export default function Login() {
    const handleLogin = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error signing in with Google", error);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Welcome Back!</h1>
                <p className="text-gray-600 mb-6">Sign in to sync your data across all devices.</p>

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
