import React from 'react';
import { formatCurrency } from '../utils/currency';

interface FinancialSummaryProps {
  income: number;
  expense: number;
}

const FinancialSummary: React.FC<FinancialSummaryProps> = ({ income, expense }) => {
  const savings = income - expense;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide mb-1">Income</span>
        <span className="text-sm font-bold text-slate-900 break-all">
          {formatCurrency(income)}
        </span>
      </div>

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-1">Expense</span>
        <span className="text-sm font-bold text-slate-900 break-all">
          {formatCurrency(expense)}
        </span>
      </div>

      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center relative overflow-hidden">
        <div className={`absolute inset-0 opacity-10 ${savings >= 0 ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
        <span className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${savings >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
          {savings >= 0 ? 'Savings' : 'Balance'}
        </span>
        <span className={`text-sm font-bold break-all ${savings >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
          {formatCurrency(savings)}
        </span>
      </div>
    </div>
  );
};

export default FinancialSummary;