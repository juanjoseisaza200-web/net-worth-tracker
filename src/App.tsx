import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Wallet, TrendingUp, DollarSign, Settings, Plus } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Expenses from './components/Expenses';
import Investments from './components/Investments';
import { AppData, Currency } from './types';
import { loadData, saveData, updateBaseCurrency, loadDataFromCloud, saveDataToCloud } from './utils/storage';
import { auth } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import Login from './components/Login';
import { LogOut } from 'lucide-react';

function App() {
  const [data, setData] = useState<AppData>(loadData()); // Initial local load (optional, or empty)
  const [baseCurrency, setBaseCurrency] = useState<Currency>(data.baseCurrency);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Load cloud data on login
        const cloudData = await loadDataFromCloud(currentUser.uid);
        if (cloudData) {
          setData(cloudData);
          setBaseCurrency(cloudData.baseCurrency);
        } else {
          // If no cloud data, upload current local data? Or start fresh?
          // Let's upload local data to bootstrap the account
          await saveDataToCloud(currentUser.uid, data);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); // Only run on mount, but depends on load functions

  // Save to cloud whenever data changes
  useEffect(() => {
    if (user) {
      saveDataToCloud(user.uid, data);
    }
    saveData(data); // Keep local backup
  }, [data, user]);

  useEffect(() => {
    updateBaseCurrency(baseCurrency);
  }, [baseCurrency]);

  const handleCurrencyChange = (currency: Currency) => {
    setBaseCurrency(currency);
    const newData = { ...data, baseCurrency: currency };
    setData(newData);
    // Cloud save handled by useEffect
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* Sign Out Button (Floating top-right or just accessible) */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => signOut(auth)}
            className="bg-white p-2 rounded-full shadow-md text-gray-600 hover:text-red-600"
            title="Sign Out"
          >
            <LogOut size={20} />
          </button>
        </div>

        <main className="pb-24 max-w-md mx-auto relative">
          <Routes>
            <Route path="/" element={<Dashboard data={data} baseCurrency={baseCurrency} onCurrencyChange={handleCurrencyChange} />} />
            <Route path="/expenses" element={<Expenses data={data} setData={setData} baseCurrency={baseCurrency} onCurrencyChange={handleCurrencyChange} />} />
            <Route path="/investments" element={<Investments data={data} setData={setData} baseCurrency={baseCurrency} onCurrencyChange={handleCurrencyChange} />} />
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

