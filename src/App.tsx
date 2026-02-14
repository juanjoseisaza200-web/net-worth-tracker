import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Wallet, TrendingUp, DollarSign, Plus } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Expenses from './components/Expenses';
import Investments from './components/Investments';
import { AppData, Currency } from './types';
import { loadData, saveData, updateBaseCurrency, subscribeToData, saveDataToCloud } from './utils/storage';
import { auth } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import Login from './components/Login';
import Settings from './components/Settings';
import { LogOut } from 'lucide-react';
import Header from './components/Header';

function App() {
  const [data, setData] = useState<AppData>(loadData()); // Initial local load (optional, or empty)
  const [baseCurrency, setBaseCurrency] = useState<Currency>(data.baseCurrency);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        if (!mounted) return;
        try {
          setUser(currentUser);
          if (currentUser) {
            // Subscribe to real-time cloud data
            console.log("Subscribing to cloud data...");
            const unsubscribeData = subscribeToData(currentUser.uid, (cloudData) => {
              if (mounted) {
                console.log("Cloud data updated", cloudData);
                setData(cloudData);
                setBaseCurrency(cloudData.baseCurrency);
                setLoading(false);
              }
            });

            // Cleanup data subscription when auth state changes or component unmounts
            // Note: In a real app we might want to manage this subscription more carefully
            // but for now, this ensures we get updates. 
            // Ideally we'd store the unsubscribe function in a ref or state.
          } else {
            setLoading(false);
          }
        } catch (err: any) {
          console.error("Initialization error:", err);
          if (mounted) setInitError(err.message || "Failed to load data.");
          setLoading(false);
        }
      });
      return unsubscribeAuth;
    };

    const unsubscribePromise = initAuth();

    return () => {
      mounted = false;
      unsubscribePromise.then(unsub => unsub());
    };
  }, []); // Only run on mount, but depends on load functions

  // Explicit save handler - passed to components to trigger cloud saves on USER ACTION only
  const handleSaveData = (newData: AppData) => {
    setData(newData);
    // Save to local storage
    saveData(newData);

    // Save to cloud if user is logged in
    if (user) {
      saveDataToCloud(user.uid, newData);
    }
  };

  // Removed auto-save useEffect to prevent overwriting cloud data on initialization
  // useEffect(() => { ... }, [data, user]); 

  useEffect(() => {
    updateBaseCurrency(baseCurrency);
  }, [baseCurrency]);

  const handleCurrencyChange = (currency: Currency) => {
    setBaseCurrency(currency);
    const newData = { ...data, baseCurrency: currency };
    handleSaveData(newData);
  };

  const handleManualSync = async () => {
    if (user) {
      await saveDataToCloud(user.uid, data);
    }
  };

  // Local update handler - updates UI and local storage BUT NOT Cloud
  // Use this for background tasks like auto-refreshing prices to avoid overwriting cloud data with stale local state
  const handleLocalDataUpdate = (newData: AppData) => {
    setData(newData);
    saveData(newData);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600">Loading your finances...</p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm text-center">
          <div className="text-red-500 mb-2">⚠️ Error</div>
          <p className="text-gray-700 mb-4">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 pb-20">
        {user && <Header user={user} />}

        <main className="pb-24 max-w-md mx-auto relative">
          <Routes>
            <Route path="/" element={<Dashboard data={data} baseCurrency={baseCurrency} onCurrencyChange={handleCurrencyChange} />} />
            <Route path="/expenses" element={<Expenses data={data} setData={handleSaveData} baseCurrency={baseCurrency} onCurrencyChange={handleCurrencyChange} />} />
            <Route path="/investments" element={<Investments data={data} setData={handleSaveData} saveLocalData={handleLocalDataUpdate} baseCurrency={baseCurrency} onCurrencyChange={handleCurrencyChange} user={user} />} />
            <Route path="/settings" element={<Settings user={user} onLogout={() => signOut(auth)} onSync={handleManualSync} data={data} setData={handleSaveData} />} />
          </Routes>
        </main>
        <Navigation />
      </div>
    </Router>
  );
}

function Navigation() {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Wallet, label: 'Dashboard' },
    { path: '/expenses', icon: DollarSign, label: 'Expenses' },
    { path: '/investments', icon: TrendingUp, label: 'Investments' },
  ];

  return (
    <nav className="fixed bottom-4 left-4 right-4 bg-white border border-gray-200 shadow-lg rounded-2xl">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-full ${isActive ? 'text-blue-600' : 'text-gray-500'
                }`}
            >
              <Icon size={24} />
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default App;

