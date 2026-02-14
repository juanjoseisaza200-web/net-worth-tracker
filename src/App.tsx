import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Wallet, TrendingUp, DollarSign, Settings, Plus } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Expenses from './components/Expenses';
import Investments from './components/Investments';
import { AppData, Currency } from './types';
import { loadData, saveData, updateBaseCurrency } from './utils/storage';

function App() {
  const [data, setData] = useState<AppData>(loadData());
  const [baseCurrency, setBaseCurrency] = useState<Currency>(data.baseCurrency);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const handleCurrencyChange = (currency: Currency) => {
    setBaseCurrency(currency);
    updateBaseCurrency(currency);
    setData(prev => ({ ...prev, baseCurrency: currency }));
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 pb-20">
        <Routes>
          <Route path="/" element={<Dashboard data={data} baseCurrency={baseCurrency} onCurrencyChange={handleCurrencyChange} />} />
          <Route path="/expenses" element={<Expenses data={data} setData={setData} baseCurrency={baseCurrency} />} />
          <Route path="/investments" element={<Investments data={data} setData={setData} baseCurrency={baseCurrency} onCurrencyChange={handleCurrencyChange} />} />
        </Routes>
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
              className={`flex flex-col items-center justify-center flex-1 h-full ${
                isActive ? 'text-blue-600' : 'text-gray-500'
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

