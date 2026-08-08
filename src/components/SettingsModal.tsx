import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { CURRENCY_SYMBOL, normalizeAmount } from '../utils/currency';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dailyLimit: number;
  monthlyLimit: number;
  onSave: (daily: number, monthly: number) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  dailyLimit, 
  monthlyLimit, 
  onSave 
}) => {
  const [localDaily, setLocalDaily] = useState('');
  const [localMonthly, setLocalMonthly] = useState('');

  useEffect(() => {
    if (isOpen) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalDaily(dailyLimit.toString());
      setLocalMonthly(monthlyLimit.toString());
    }
  }, [isOpen, dailyLimit, monthlyLimit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = parseFloat(localDaily);
    const m = parseFloat(localMonthly);
    
    if (!isNaN(d) && !isNaN(m) && d > 0 && m > 0) {
      onSave(normalizeAmount(d), normalizeAmount(m));
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-lg text-slate-800">Budget Settings</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Daily Budget Limit</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{CURRENCY_SYMBOL}</span>
              <input
                type="number"
                step="1"
                value={localDaily}
                onChange={(e) => setLocalDaily(e.target.value)}
                className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-lg font-medium"
                placeholder="400000"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Used for your daily progress bar.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Monthly Budget Limit</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{CURRENCY_SYMBOL}</span>
              <input
                type="number"
                step="1"
                value={localMonthly}
                onChange={(e) => setLocalMonthly(e.target.value)}
                className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-lg font-medium"
                placeholder="12000000"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Used for monthly overview tracking.</p>
          </div>

          <div className="pt-2">
            <Button type="submit" className="w-full">
              Save Settings
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal;