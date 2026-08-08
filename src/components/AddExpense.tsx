import React, { useState } from 'react';
import { Button } from './ui/Button';
import {ExpenseCategory, IncomeCategory, type RecurrenceFrequency, type TransactionType} from "../../types.ts";
import { CURRENCY_SYMBOL, normalizeAmount } from '../utils/currency';

interface AddExpenseProps {
  onAdd: (expense: { 
    amount: number; 
    category: string; 
    description: string; 
    date: string;
    type: TransactionType;
    isRecurring?: boolean;
    frequency?: RecurrenceFrequency;
  }) => void | Promise<void>;
}

const AddExpense: React.FC<AddExpenseProps> = ({ onAdd }) => {
    const [entryType, setEntryType] = useState<TransactionType>('EXPENSE');

    // Manual State
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<string>(ExpenseCategory.FOOD);

    // Recurring State
    const [isRecurring, setIsRecurring] = useState(false);
    const [frequency, setFrequency] = useState<RecurrenceFrequency>('MONTHLY');

    const [isSaving, setIsSaving] = useState(false);

    const handleSubmitManual = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || !description || isSaving) return;

        setIsSaving(true);
        try {
            // Saving now goes over the network, so wait for it to succeed before
            // clearing the form — otherwise a failed save loses what was typed.
            await onAdd({
                amount: normalizeAmount(parseFloat(amount)),
                description,
                category,
                date: new Date().toISOString(),
                type: entryType,
                isRecurring,
                frequency: isRecurring ? frequency : undefined
            });
        } catch {
            // App.tsx surfaces the message; keep the form populated for a retry.
            return;
        } finally {
            setIsSaving(false);
        }

        // Reset
        setAmount('');
        setDescription('');
        setIsRecurring(false);
        setFrequency('MONTHLY');
        // Reset category to default for current type
        setCategory(entryType === 'EXPENSE' ? ExpenseCategory.FOOD : IncomeCategory.SALARY);
    };

    // Toggle handler
    const handleTypeChange = (type: TransactionType) => {
        setEntryType(type);
        setCategory(type === 'EXPENSE' ? ExpenseCategory.FOOD : IncomeCategory.SALARY);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Entry Type Toggle */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 gap-1">
                <button
                    onClick={() => handleTypeChange('EXPENSE')}
                    className={`py-2 text-sm font-bold rounded-xl transition-all ${
                        entryType === 'EXPENSE'
                            ? 'bg-white text-red-500 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    Expense
                </button>
                <button
                    onClick={() => handleTypeChange('INCOME')}
                    className={`py-2 text-sm font-bold rounded-xl transition-all ${
                        entryType === 'INCOME'
                            ? 'bg-white text-emerald-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    Income
                </button>
            </div>

            <div className="p-4">
                    <form onSubmit={handleSubmitManual} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Amount</label>
                            <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold text-lg ${entryType === 'INCOME' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {entryType === 'INCOME' ? '+' : '-'}
                </span>
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{CURRENCY_SYMBOL}</span>
                                <input
                                    type="number"
                                    step="1"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-lg"
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Description</label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder={entryType === 'EXPENSE' ? "e.g., Netflix Subscription" : "e.g., Paycheck"}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Category</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                            >
                                {Object.values(entryType === 'EXPENSE' ? ExpenseCategory : IncomeCategory).map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        {/* Recurring Toggle */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-700">Recurring {entryType === 'INCOME' ? 'Income' : 'Payment'}?</label>
                                <button
                                    type="button"
                                    onClick={() => setIsRecurring(!isRecurring)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isRecurring ? 'bg-blue-600' : 'bg-slate-300'}`}
                                >
                  <span
                      className={`${
                          isRecurring ? 'translate-x-6' : 'translate-x-1'
                      } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                  />
                                </button>
                            </div>

                            {isRecurring && (
                                <div className="mt-3 pt-3 border-t border-slate-200 animate-in slide-in-from-top-1">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Frequency</label>
                                    <select
                                        value={frequency}
                                        onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-sm"
                                    >
                                        <option value="DAILY">Daily</option>
                                        <option value="WEEKLY">Weekly</option>
                                        <option value="MONTHLY">Monthly</option>
                                        <option value="YEARLY">Yearly</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <Button
                            type="submit"
                            isLoading={isSaving}
                            className={`w-full ${entryType === 'INCOME' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30' : ''}`}
                        >
                            Add {entryType === 'INCOME' ? 'Income' : 'Expense'}
                        </Button>
                    </form>
            </div>
        </div>
    );
};

export default AddExpense;