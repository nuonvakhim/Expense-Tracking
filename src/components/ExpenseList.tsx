import React from 'react';
import {CATEGORY_COLORS, type Expense} from "../../types.ts";
import { CURRENCY_SYMBOL, formatCurrency } from '../utils/currency';

interface ExpenseListProps {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
}

const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onDelete, onEdit }) => {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No transactions found</h3>
        <p className="text-slate-500 mt-1 max-w-xs mx-auto">Try adjusting your filters or add a new transaction.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {expenses.map((expense) => {
        const isIncome = expense.type === 'INCOME';
        
        return (
          <div 
            key={expense.id} 
            className="group flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4 overflow-hidden">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[expense.category] || (isIncome ? '#10b981' : '#cbd5e1') }}
              >
                {isIncome ? `+ ${CURRENCY_SYMBOL}` : expense.category.charAt(0)}
              </div>
              <div className="min-w-0">
                <h4 className="font-medium text-slate-900 truncate pr-2">{expense.description}</h4>
                <p className="text-xs text-slate-500">{expense.category} • {new Date(expense.date).toLocaleDateString()}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 shrink-0">
              <span className={`font-mono font-semibold mr-2 ${isIncome ? 'text-emerald-600' : 'text-slate-900'}`}>
                {isIncome ? '+ ' : ''}{formatCurrency( expense.amount)}
              </span>
              
              <button 
                onClick={() => onEdit(expense)}
                className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                aria-label="Edit transaction"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>

              <button 
                onClick={() => onDelete(expense.id)}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                aria-label="Delete transaction"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ExpenseList;