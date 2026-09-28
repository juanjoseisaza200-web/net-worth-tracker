import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Wallet, TrendingUp, DollarSign, Building2, Users, Inbox, ChevronRight } from 'lucide-react';
import { AppData, Currency } from './types';
import { loadData, saveData, subscribeToData, saveDataToCloud, subscribeToInbox, deleteInboxItem } from './utils/storage';
import { auth } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import Login from './components/Login';
import Header from './components/Header';
import { fetchExchangeRates } from './utils/currency';
import { recordNetWorthSnapshot } from './utils/calculations';
import { accrueFixedIncome } from './utils/fixedIncome';
import { processInbox, applyEntry, InboxItem, PendingEntry } from './utils/inbox';

// Route screens are code-split so the initial bundle stays small; each loads on
// first navigation to that tab.
const Dashboard = lazy(() => import('./components/Dashboard'));
const Accounts = lazy(() => import('./components/Accounts'));
const Expenses = lazy(() => import('./components/Expenses'));
const Investments = lazy(() => import('./components/Investments'));
const Debts = lazy(() => import('./components/Debts'));
const Settings = lazy(() => import('./components/Settings'));
const Review = lazy(() => import('./components/Review'));

function App() {
  const [data, setData] = useState<AppData>(loadData()); // Initial local load (optional, or empty)
  const [viewCurrencies, setViewCurrencies] = useState<Record<string, Currency>>({
    dashboard: data.baseCurrency,
    expenses: data.baseCurrency,
    investments: data.baseCurrency,
    accounts: data.baseCurrency,
    debts: data.baseCurrency
  });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  // Value is unused; the setter is called only to force a re-render once live
  // exchange rates land (they mutate a module-level table, not React state).
  const [, setRatesLoaded] = useState(false);
  // Holds the active Firestore snapshot unsubscribe so it can be torn down
  // before re-subscribing or on unmount (prevents stacked listeners).
  const dataUnsubRef = useRef<(() => void) | null>(null);
  // Automatic-capture items waiting in Firestore, and the ids whose delete is
  // already in flight (so a re-render doesn't fire it again).
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const deletingInboxIds = useRef(new Set<string>());

  useEffect(() => {
    // Fetch live exchange rates on boot
    fetchExchangeRates().then(() => {
      setRatesLoaded(true); // Triggers re-render so components use live rates
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        if (!mounted) return;

        // Tear down any previous Firestore data subscription before (re)subscribing.
        // onAuthStateChanged can fire more than once (token refresh, re-login); without
        // this, every firing would stack another onSnapshot listener that never gets
        // cleaned up and re-runs the automations->save path, leaking listeners and
        // compounding cloud writes/alerts.
        if (dataUnsubRef.current) {
          dataUnsubRef.current();
          dataUnsubRef.current = null;
        }

        try {
          setUser(currentUser);
          if (currentUser) {
            // Subscribe to real-time cloud data
            console.log("Subscribing to cloud data...");
            dataUnsubRef.current = subscribeToData(currentUser.uid, async (cloudData) => {
              if (mounted) {
                console.log("Cloud data updated", cloudData);
                // Side effects of loading data: accrue daily fixed-income interest,
                // then run scheduled automations / recurring incomes. Both return the
                // same reference when nothing changes, so `newData !== cloudData`
                // tells us whether we need to persist an update.
                const accrued = accrueFixedIncome(cloudData);
                const { newData, messages } = (await import('./utils/automations')).processAutomations(accrued);
                const changed = newData !== cloudData;

                if (changed) {
                  try {
                    await saveDataToCloud(currentUser.uid, newData);
                    if (messages.length > 0) {
                      alert("Automations Ran automatically:\n" + messages.join("\n"));
                    }
                  } catch (e) {
                    console.error("Failed to save data updates", e);
                  }
                }

                // Always reflect the latest data locally and finish loading.
                setData(newData);
                saveData(newData); // keep localStorage fresh for next boot
                setIsCloudSynced(true); // Mark as synced - SAFE TO SAVE NOW
                setLoading(false);
              }
            });
          } else {
            // Signed out: block cloud saves until the next login re-syncs.
            setIsCloudSynced(false);
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
      // Tear down both the data snapshot listener and the auth listener.
      if (dataUnsubRef.current) {
        dataUnsubRef.current();
        dataUnsubRef.current = null;
      }
      unsubscribePromise.then(unsub => unsub());
    };
  }, []); // Only run on mount, but depends on load functions

  const inboxKey = data.settings?.inboxKey;

  useEffect(() => {
    if (!user || !isCloudSynced || !inboxKey) {
      setInboxItems([]);
      return;
    }
    return subscribeToInbox(inboxKey, setInboxItems);
  }, [user, isCloudSynced, inboxKey]);

  const inbox = useMemo(() => processInbox(data, inboxItems), [data, inboxItems]);

  // Book categorised Apple Pay captures and drop paired/unreadable SMS as soon
  // as they arrive. The data is saved BEFORE the items are deleted: if the save
  // fails the items stay and are retried; if the delete fails, re-processing is
  // a no-op because booked records carry the item's id.
  useEffect(() => {
    if (!user || !isCloudSynced || !inboxKey) return;
    const { data: next, deleteIds } = inbox;
    const fresh = deleteIds.filter(id => !deletingInboxIds.current.has(id));
    if (next === data && fresh.length === 0) return;
    fresh.forEach(id => deletingInboxIds.current.add(id));
    (async () => {
      try {
        if (next !== data) {
          const toSave = recordNetWorthSnapshot(next);
          setData(toSave);
          saveData(toSave);
          await saveDataToCloud(user.uid, toSave);
        }
        await Promise.all(fresh.map(id => deleteInboxItem(inboxKey, id)));
      } catch (e) {
        console.error('Failed to process captured transactions', e);
        fresh.forEach(id => deletingInboxIds.current.delete(id));
      }
    })();
  }, [inbox, data, user, isCloudSynced, inboxKey]);

  /** Review queue: book the entry (or just discard it when null), then clear the item. */
  const resolvePending = async (itemId: string, entry: PendingEntry | null) => {
    if (!user || !isCloudSynced || !inboxKey) return;
    if (entry) {
      const toSave = recordNetWorthSnapshot(applyEntry(data, entry));
      setData(toSave);
      saveData(toSave);
      await saveDataToCloud(user.uid, toSave);
    }
    await deleteInboxItem(inboxKey, itemId);
  };

  // User Actions -> Cloud Save
  const handleCloudSave = async (newData: AppData) => {
    // Record today's net-worth snapshot as a side effect of every explicit save
    // (deduped per day) so the history/trend chart accumulates over time.
    const dataToSave = recordNetWorthSnapshot(newData);

    // 1. Optimistic Update (Local)
    setData(dataToSave);
    saveData(dataToSave);

    if (user) {
      // CRITICAL SAFETY GUARD:
      // Prevent overwriting cloud data if we haven't successfully synced yet.
      // This stops "Stale Tab" overwrites where an old open tab auto-saves its
      // old state before downloading the new state, wiping your data.
      if (!isCloudSynced) {
        console.warn("BLOCKED: Attempted to save to cloud before initial sync to prevent data loss.");
        return;
      }

      try {
        setIsSaving(true);
        setSaveError(null);
        await saveDataToCloud(user.uid, dataToSave);
        setLastSaved(new Date());
      } catch (err) {
        console.error("Save failed", err);
        setSaveError("Failed to save to cloud. Please check internet connection.");
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Background Updates -> Local Save Only
  const handleLocalSave = (newData: AppData) => {
    setData(newData);
    saveData(newData);
  };

  // Removed auto-save useEffect to prevent overwriting cloud data on initialization
  // useEffect(() => { ... }, [data, user]); 

  // Removed auto-save useEffect to prevent overwriting cloud data on initialization
  // useEffect(() => { ... }, [data, user]); 

  const handleViewCurrencyChange = (view: string, currency: Currency) => {
    setViewCurrencies(prev => ({ ...prev, [view]: currency }));
  };

  const handleManualSync = async () => {
    if (user) {
      try {
        setIsSaving(true);
        setSaveError(null);
        await saveDataToCloud(user.uid, data);
        setLastSaved(new Date());
      } catch (err) {
        console.error("Manual sync failed", err);
        setSaveError("Failed to sync. Please check connection.");
      } finally {
        setIsSaving(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-ios-fill border-t-ios-gray mb-4"></div>
        <p className="text-ios-secondary">Loading your finances...</p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-ios-card p-6 rounded-ios max-w-sm text-center">
          <div className="text-ios-red text-ios-headline mb-2">Error</div>
          <p className="text-ios-secondary mb-4">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="h-11 px-6 rounded-full bg-ios-blue text-white text-ios-headline active:opacity-80"
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
      <div className="min-h-screen bg-ios-bg pb-20 relative">
        {user && <Header user={user} />}

        {/* Save Status Indicator */}
        <div className="fixed top-4 right-4 z-50 flex flex-col items-end pointer-events-none">
          {isSaving && (
            <div className="ios-material text-ios-secondary text-ios-caption font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-ios-fill border-t-ios-gray rounded-full animate-spin"></div>
              Saving…
            </div>
          )}
          {!isSaving && lastSaved && !saveError && (
            <div className="ios-material text-ios-green text-ios-caption font-medium px-3 py-1.5 rounded-full">
              Saved
            </div>
          )}
          {saveError && (
            <div className="pointer-events-auto ios-material text-ios-red text-ios-caption font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
              <span>{saveError}</span>
              <button
                onClick={handleManualSync}
                disabled={isSaving}
                className="font-semibold text-ios-blue disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        <main className="pb-24 max-w-md mx-auto relative">
          <ReviewBanner count={inbox.pending.length} />
          <Suspense fallback={
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-ios-fill border-t-ios-gray"></div>
            </div>
          }>
          <Routes>
            <Route path="/" element={<Dashboard data={data} setData={handleCloudSave} baseCurrency={viewCurrencies.dashboard} onCurrencyChange={(c) => handleViewCurrencyChange('dashboard', c)} />} />
            <Route path="/expenses" element={<Expenses data={data} setData={handleCloudSave} baseCurrency={viewCurrencies.expenses} onCurrencyChange={(c) => handleViewCurrencyChange('expenses', c)} />} />
            <Route path="/investments" element={<Investments data={data} setData={handleCloudSave} saveLocalData={handleLocalSave} baseCurrency={viewCurrencies.investments} onCurrencyChange={(c) => handleViewCurrencyChange('investments', c)} />} />
            <Route path="/accounts" element={<Accounts data={data} setData={handleCloudSave} baseCurrency={viewCurrencies.accounts} onCurrencyChange={(c) => handleViewCurrencyChange('accounts', c)} />} />
            <Route path="/debts" element={<Debts data={data} setData={handleCloudSave} baseCurrency={viewCurrencies.debts} onCurrencyChange={(c) => handleViewCurrencyChange('debts', c)} />} />
            <Route path="/review" element={<Review data={data} pending={inbox.pending} onResolve={resolvePending} />} />
            <Route path="/settings" element={<Settings user={user} onLogout={() => signOut(auth)} onSync={handleManualSync} data={data} setData={handleCloudSave} />} />
          </Routes>
          </Suspense>
        </main>
        <Navigation />
      </div>
    </Router>
  );
}

function ReviewBanner({ count }: { count: number }) {
  const location = useLocation();
  if (count === 0 || location.pathname === '/review') return null;
  return (
    <Link
      to="/review"
      className="mx-4 mb-4 flex items-center gap-3 bg-ios-card rounded-ios pl-4 pr-3 py-3 active:bg-ios-fill"
    >
      <span className="w-[30px] h-[30px] rounded-[8px] bg-ios-orange text-white flex items-center justify-center shrink-0">
        <Inbox size={18} strokeWidth={2.25} />
      </span>
      <span className="flex-1 text-ios-body">
        {count} captured {count === 1 ? 'transaction' : 'transactions'} to review
      </span>
      <ChevronRight size={18} className="text-ios-tertiary" strokeWidth={2.5} />
    </Link>
  );
}

function Navigation() {
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Wallet, label: 'Dashboard' },
    { path: '/accounts', icon: Building2, label: 'Accounts' },
    { path: '/expenses', icon: DollarSign, label: 'Expenses' },
    { path: '/debts', icon: Users, label: 'Debts' },
    { path: '/investments', icon: TrendingUp, label: 'Investments' },
  ];

  return (
    <nav
      className="ios-material fixed bottom-4 left-3 right-3 max-w-md mx-auto rounded-full z-40"
      style={{ boxShadow: '0 0 0 0.5px var(--ios-separator), 0 8px 24px rgba(0, 0, 0, 0.12)' }}
    >
      <div className="flex justify-around items-center h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 h-12 rounded-full transition-colors ${isActive ? 'text-ios-blue bg-ios-fill' : 'text-ios-label'
                }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
              <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default App;

