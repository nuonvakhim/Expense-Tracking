import React, { useState, useEffect, useRef } from 'react';
import AddExpense from './components/AddExpense';
import ExpenseList from './components/ExpenseList';
import SummaryChart from './components/SummaryChart';
import DailyLimit from './components/DailyLimit';
import FinancialSummary from './components/FinancialSummary';
import EditExpenseModal from './components/EditExpenseModal';
import SettingsModal from './components/SettingsModal';
import RecurringExpensesModal from './components/RecurringExpensesModal';
import { api, ApiError } from './api/client';
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

type TimeFilter = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';
type BudgetPeriod = 'DAILY' | 'MONTHLY';

const App: React.FC = () => {
  // Records are persisted in localStorage.
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Budget State
  // Defaults are riel-scaled (roughly the old $100 / $3,000 at ~4,000៛ to USD).
  const [dailyLimit, setDailyLimit] = useState(400_000);
  const [monthlyLimit, setMonthlyLimit] = useState(12_000_000);
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>('DAILY');

  // Filter State
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('TODAY');

  // Modal States
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecurringOpen, setIsRecurringOpen] = useState(false);

  // StrictMode runs effects twice in dev. Bootstrap writes to the database,
  // so it must run exactly once.
  const didBootstrap = useRef(false);

  useEffect(() => {
    if (didBootstrap.current) return;
    didBootstrap.current = true;

    const storedDaily = localStorage.getItem('gemini_daily_limit');
    if (storedDaily) setDailyLimit(parseFloat(storedDaily));

    const storedMonthly = localStorage.getItem('gemini_monthly_limit');
    if (storedMonthly) setMonthlyLimit(parseFloat(storedMonthly));

    void bootstrap();
  }, []);

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

  // Persist limits
  useEffect(() => {
    localStorage.setItem('gemini_daily_limit', dailyLimit.toString());
    localStorage.setItem('gemini_monthly_limit', monthlyLimit.toString());
  }, [dailyLimit, monthlyLimit]);

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
        setRecurringExpenses(prev => [ExpenseTracker...prev, rule]);
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
  };

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
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            ExpenseTracker V1
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
        ) : (
          <>
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

        {/* List Filters */}
        <section className="space-y-4">
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

          {/* Time Filter Tabs */}
          <div className="bg-slate-200/50 p-1 rounded-xl flex gap-1">
            {(['TODAY', 'WEEK', 'MONTH', 'ALL'] as TimeFilter[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  timeFilter === tf
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart (Only show expenses) */}
          {filteredExpenses.some(e => e.type === 'EXPENSE') && (
             <SummaryChart expenses={filteredExpenses.filter(e => e.type === 'EXPENSE')} />
          )}

          <ExpenseList
            expenses={filteredExpenses}
            onDelete={deleteExpense}
            onEdit={setEditingExpense}
          />
        </section>
          </>
        )}
      </main>

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
