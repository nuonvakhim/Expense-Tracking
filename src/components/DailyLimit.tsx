import React from 'react';
import { formatCurrency } from '../utils/currency';

interface DailyLimitProps {
  currentAmount: number;
  limit: number;
  period: 'DAILY' | 'MONTHLY';
  onTogglePeriod: (period: 'DAILY' | 'MONTHLY') => void;
}

const DailyLimit: React.FC<DailyLimitProps> = ({ 
  currentAmount, 
  limit, 
  period,
  onTogglePeriod
}) => {
  const percentage = Math.min((currentAmount / limit) * 100, 100);
  const isOverLimit = currentAmount > limit;
  
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden transition-all">
      <div className="flex justify-between items-start mb-2 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {period === 'DAILY' ? 'Daily Budget' : 'Monthly Budget'}
            </h3>
            <button 
              onClick={() => onTogglePeriod(period === 'DAILY' ? 'MONTHLY' : 'DAILY')}
              className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full transition-colors"
            >
              Switch to {period === 'DAILY' ? 'Monthly' : 'Daily'}
            </button>
          </div>
          
          <div className="flex items-baseline mt-1">
            <span className={`text-2xl font-bold ${isOverLimit ? 'text-red-500' : 'text-slate-900'}`}>
              {formatCurrency(currentAmount)}
            </span>
            <span className="ml-1 text-sm text-slate-400">
              / {formatCurrency(limit)}
            </span>
          </div>
        </div>
        <div className="text-right">
           <span className={`text-xs font-medium px-2 py-1 rounded-full ${isOverLimit ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
             {percentage.toFixed(0)}% used
           </span>
        </div>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden relative z-10">
        <div 
          className={`h-full rounded-full transition-all duration-500 ease-out ${isOverLimit ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      {isOverLimit && (
        <p className="text-xs text-red-500 mt-2 font-medium flex items-center gap-1 animate-pulse relative z-10">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Budget limit exceeded!
        </p>
      )}
    </div>
  ); 
};

export default DailyLimit;