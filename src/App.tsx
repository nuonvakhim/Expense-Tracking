import React, { useState, useEffect, useRef } from 'react';
import AddExpense from './components/AddExpense';
import ExpenseList from './components/ExpenseList';
import SummaryChart from './components/SummaryChart';
import DailyLimit from './components/DailyLimit';
import FinancialSummary from './components/FinancialSummary';
import EditExpenseModal from './components/EditExpenseModal';
import SettingsModal from './components/SettingsModal';
import RecurringExpensesModal from './components/RecurringExpensesModal';
import AuthScreen from './components/AuthScreen';
import TimeFilterTabs, { type TimeFilter } from './components/TimeFilterTabs';
import { api, ApiError, setUnauthorizedHandler, type AuthUser } from './api/client';
import { processDueRecurring } from './api/sync';
import {
    type Expense,
    ExpenseCategory, IncomeCategory,
    type RecurrenceFrequency,
    type RecurringExpense,
    type TransactionType
} from '../types';

// Date helpers
const isToday = (dateString: string) => {
  const d = new Date(dateString);
  const now = new Date();
  return d.getDate() === now.getDate() &&
         d.getMonth() === now.getMonth() &&
         d.getFullYear() === now.getFullYear();
};

const isThisMonth = (dateString: string) => {
  const d = new Date(dateString);
  const now = new Date();
  return d.getMonth() === now.getMonth() &&
         d.getFullYear() === now.getFullYear();
};

const isThisWeek = (dateString: string) => {
  const d = new Date(dateString);
  const now = new Date();
  const day = now.getDay() || 7;
  if (day !== 1) now.setHours(-24 * (day - 1));
  else now.setHours(0,0,0,0);
  now.setHours(0,0,0,0);
  return new Date(d) >= now;
};

const describeError = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';

// Advance a date by one recurrence period without mutating the original.
const advance = (from: Date, frequency: RecurrenceFrequency): Date => {
  const d = new Date(from);
  if (frequency === 'DAILY') d.setDate(d.getDate() + 1);
  else if (frequency === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (frequency === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d;
};

type MainTab = 'HOME' | 'HISTORY';
type BudgetPeriod = 'DAILY' | 'MONTHLY';

// Defaults are riel-scaled (roughly the old $100 / $3,000 at ~4,000៛ to USD).
const DEFAULT_DAILY_LIMIT = 400_000;
const DEFAULT_MONTHLY_LIMIT = 12_000_000;

// Budget limits stay client-side, but they are now namespaced per account: on a
// shared browser, one person's limits must not surface in another's session.
const limitKey = (userId: string, which: 'daily' | 'monthly') =>
  `expense_tracker:${userId}:${which}_limit`;

// Keys used before accounts existed. The first account to sign in on this
// browser inherits them, and they are removed at that point so no later account
// can pick up someone else's numbers.
const LEGACY_KEYS = { daily: 'gemini_daily_limit', monthly: 'gemini_monthly_limit' } as const;

const TABS: { id: MainTab; label: string; icon: string }[] = [
  { id: 'HOME', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'HISTORY', label: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
];

const readLimit = (userId: string, which: 'daily' | 'monthly', fallback: number): number => {
  const stored = localStorage.getItem(limitKey(userId, which)) ?? localStorage.getItem(LEGACY_KEYS[which]);
  const value = stored === null ? NaN : parseFloat(stored);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const App: React.FC = () => {
  // Session
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthResolving, setIsAuthResolving] = useState(true);

  // Records live in Postgres, scoped to the signed-in account.
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Budget State
  const [dailyLimit, setDailyLimit] = useState(DEFAULT_DAILY_LIMIT);
  const [monthlyLimit, setMonthlyLimit] = useState(DEFAULT_MONTHLY_LIMIT);
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>('DAILY');

  // Filter State
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('TODAY');

  // Navigation
  const [activeTab, setActiveTab] = useState<MainTab>('HOME');

  // Modal States
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecurringOpen, setIsRecurringOpen] = useState(false);

  // StrictMode runs effects twice in dev. Session resolution and bootstrap both
  // write (bootstrap posts due recurring rows), so each must run exactly once.
  const didResolveSession = useRef(false);
  const bootstrappedFor = useRef<string | null>(null);

  // The session cookie is httpOnly, so the only way to know whether one is still
  // valid is to ask. A 401 here simply means "show the login screen".
  useEffect(() => {
    if (didResolveSession.current) return;
    didResolveSession.current = true;

    void (async () => {
      try {
        setUser(await api.me());
      } catch {
        setUser(null);
      } finally {
        setIsAuthResolving(false);
      }
    })();
  }, []);

  // The server can end a session at any time — expiry, logout elsewhere, or a
  // password change on another device. Drop straight back to the login screen
  // rather than leaving stale records on screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setExpenses([]);
      setRecurringExpenses([]);
      setError(null);
    });
    return () => { setUnauthorizedHandler(null); };
  }, []);

  // Load this account's data once it is known.
  useEffect(() => {
    if (!user) {
      bootstrappedFor.current = null;
      return;
    }
    if (bootstrappedFor.current === user.id) return;
    bootstrappedFor.current = user.id;

    const daily = readLimit(user.id, 'daily', DEFAULT_DAILY_LIMIT);
    const monthly = readLimit(user.id, 'monthly', DEFAULT_MONTHLY_LIMIT);
    setDailyLimit(daily);
    setMonthlyLimit(monthly);

    // Write the resolved values under this account's keys before dropping the
    // pre-accounts keys, so a value inherited from them is not lost on reload.
    localStorage.setItem(limitKey(user.id, 'daily'), daily.toString());
    localStorage.setItem(limitKey(user.id, 'monthly'), monthly.toString());
    localStorage.removeItem(LEGACY_KEYS.daily);
    localStorage.removeItem(LEGACY_KEYS.monthly);

    void bootstrap();
  }, [user]);

  const bootstrap = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [txResponse, recurringResponse] = await Promise.all([
        api.listTransactions(),
        api.listRecurring(),
      ]);

      // Post any recurring occurrences that came due while the app was closed.
      const processed = await processDueRecurring(recurringResponse.data);

      setExpenses([...processed.created, ...txResponse.data]);
      setRecurringExpenses(processed.rules);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    // Revokes the session server-side, so the cookie is useless even if it was
    // captured. Local state is cleared either way.
    try {
      await api.logout();
    } finally {
      setUser(null);
      setExpenses([]);
      setRecurringExpenses([]);
      setError(null);
      setActiveTab('HOME');
      setIsSettingsOpen(false);
      setIsRecurringOpen(false);
      setEditingExpense(null);
    }
  };


  const addExpense = async (data: { amount: number; category: string; description: string; date: string; type: TransactionType; isRecurring?: boolean; frequency?: RecurrenceFrequency }) => {
    setError(null);
    try {
      const created = await api.createTransaction({
        amount: data.amount,
        category: data.category,
        description: data.description,
        date: data.date,
        type: data.type,
      });
      setExpenses(prev => [created, ...prev]);

      // Handle Recurring
      if (data.isRecurring && data.frequency) {
        const rule = await api.createRecurring({
          amount: data.amount,
          category: data.category,
          description: data.description,
          frequency: data.frequency,
          nextDueDate: advance(new Date(data.date), data.frequency).toISOString(),
          type: data.type,
        });
        setRecurringExpenses(prev => [...prev, rule]);
      }
    } catch (err) {
      setError(describeError(err));
      throw err; // lets AddExpense keep the form contents on failure
    }
  };

  const updateExpense = async (updated: Expense) => {
    setError(null);
    try {
      const saved = await api.updateTransaction(updated.id, {
        amount: updated.amount,
        category: updated.category,
        description: updated.description,
        date: updated.date,
        type: updated.type,
      });
      setExpenses(prev => prev.map(e => e.id === saved.id ? saved : e));
    } catch (err) {
      setError(describeError(err));
    }
  };

  const deleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    setError(null);
    try {
      await api.deleteTransaction(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(describeError(err));
    }
  };

  const deleteRecurring = async (id: string) => {
    if (!window.confirm('Stop this recurring transaction?')) return;
    setError(null);
    try {
      await api.deleteRecurring(id);
      setRecurringExpenses(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(describeError(err));
    }
  };

  const handleSaveSettings = (newDaily: number, newMonthly: number) => {
    setDailyLimit(newDaily);
    setMonthlyLimit(newMonthly);
    // Written here rather than in an effect on [dailyLimit, monthlyLimit]: such
    // an effect also fires on the render where `user` changes, and would persist
    // the outgoing account's values under the incoming account's key first.
    if (user) {
      localStorage.setItem(limitKey(user.id, 'daily'), newDaily.toString());
      localStorage.setItem(limitKey(user.id, 'monthly'), newMonthly.toString());
    }
  };

  // Nothing renders until we know whether there is a session — showing the app
  // shell first and the login screen a moment later would flash private-looking
  // chrome at a signed-out visitor.
  if (isAuthResolving) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">
        <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />;
  }

  // Filter Logic
  const filteredExpenses = expenses.filter(e => {
    if (categoryFilter !== 'ALL' && e.category !== categoryFilter) return false;
    if (timeFilter === 'TODAY') return isToday(e.date);
    if (timeFilter === 'WEEK') return isThisWeek(e.date);
    if (timeFilter === 'MONTH') return isThisMonth(e.date);
    return true;
  });

  // Calculate Totals for the current Filter View
  const totalIncome = filteredExpenses
    .filter(e => e.type === 'INCOME')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalExpense = filteredExpenses
    .filter(e => e.type === 'EXPENSE')
    .reduce((sum, e) => sum + e.amount, 0);

  // Calculate Budget Spend (Always filter by current period regardless of view filter for consistency in progress bar, or use filter?)
  // Usually budget is "This Month" or "Today" regardless of what list I'm looking at,
  // BUT for the UI it might be better to show the budget corresponding to the current view if it matches,
  // however, budgetPeriod is explicitly 'DAILY' or 'MONTHLY'.
  // Let's calculate spend based on the ACTIVE Budget Period logic.
  const currentBudgetSpend = expenses
    .filter(e => e.type === 'EXPENSE') // Only count expenses
    .filter(e => budgetPeriod === 'DAILY' ? isToday(e.date) : isThisMonth(e.date))
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r   from-blue-600 to-purple-600 bg-clip-text text-transparent">
            ExpenseTracker V2
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setIsRecurringOpen(true)}
              className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              aria-label="Recurring Expenses"
              title="Recurring Expenses"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              aria-label="Settings"
            >
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
               </svg>
            </button>
            <button
              onClick={() => { void handleSignOut(); }}
              className="w-10 h-10 rounded-full bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 flex items-center justify-center text-slate-600 hover:text-red-600 transition-colors"
              aria-label={`Sign out of ${user.email}`}
              title={`Signed in as ${user.email} — sign out`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">

        {/* Storage errors */}
        {error && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="text-sm text-red-800">{error}</p>
              <button
                onClick={() => { void bootstrap(); }}
                className="text-xs font-bold text-red-600 hover:text-red-800 mt-1 underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
            <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium">Loading your transactions…</p>
          </div>
        ) : activeTab === 'HOME' ? (
          <div id="panel-home" role="tabpanel" aria-labelledby="tab-home" className="space-y-6">
            {/* Period selector — drives the summary below and the History list */}
            <TimeFilterTabs value={timeFilter} onChange={setTimeFilter} />

            {/* Financial Summary - Shows stats based on current filters */}
            <FinancialSummary income={totalIncome} expense={totalExpense} />

            {/* Budget Component - Always shows configured budget vs actual spend */}
            <DailyLimit
              currentAmount={currentBudgetSpend}
              limit={budgetPeriod === 'DAILY' ? dailyLimit : monthlyLimit}
              period={budgetPeriod}
              onTogglePeriod={setBudgetPeriod}
            />

            {/* Add Expense */}
            <section>
              <h2 className="text-lg font-bold text-slate-800 mb-3">Add Transaction</h2>
              <AddExpense onAdd={addExpense} />
            </section>
          </div>
        ) : (
          <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">History</h2>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none max-w-[120px]"
              >
                <option value="ALL">All Categories</option>
                {Object.values(ExpenseCategory).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {Object.values(IncomeCategory).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <TimeFilterTabs value={timeFilter} onChange={setTimeFilter} />

            {/* Totals for whatever the filters currently select */}
            <FinancialSummary income={totalIncome} expense={totalExpense} />

            {/* Chart (Only show expenses) */}
            {filteredExpenses.some(e => e.type === 'EXPENSE') && (
              <SummaryChart expenses={filteredExpenses.filter(e => e.type === 'EXPENSE')} />
            )}

            <ExpenseList
              expenses={filteredExpenses}
              onDelete={deleteExpense}
              onEdit={setEditingExpense}
            />
          </div>
        )}
      </main>

      {/* Bottom tab bar */}
      <nav
        role="tablist"
        aria-label="Sections"
        className="fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200"
      >
        <div className="max-w-md mx-auto px-4 py-2 flex">
          {TABS.map(({ id, label, icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                id={`tab-${id.toLowerCase()}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${id.toLowerCase()}`}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors ${
                  isActive ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
                <span className="text-[11px] font-bold">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      <EditExpenseModal
        expense={editingExpense}
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        onSave={updateExpense}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        dailyLimit={dailyLimit}
        monthlyLimit={monthlyLimit}
        onSave={handleSaveSettings}
      />

      <RecurringExpensesModal
        isOpen={isRecurringOpen}
        onClose={() => setIsRecurringOpen(false)}
        recurringExpenses={recurringExpenses}
        onDelete={deleteRecurring}
      />
    </div>
  );
};

export default App;
