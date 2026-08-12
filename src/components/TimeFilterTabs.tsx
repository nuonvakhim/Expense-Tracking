import React from 'react';

export type TimeFilter = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

interface TimeFilterTabsProps {
  value: TimeFilter;
  onChange: (value: TimeFilter) => void;
}

const OPTIONS: TimeFilter[] = ['TODAY', 'WEEK', 'MONTH', 'ALL'];

// The period drives both the Home summary and the History list, so the control
// is rendered on each tab against one shared piece of state.
const TimeFilterTabs: React.FC<TimeFilterTabsProps> = ({ value, onChange }) => (
  <div className="bg-slate-200/50 p-1 rounded-xl flex gap-1">
    {OPTIONS.map((tf) => (
      <button
        key={tf}
        onClick={() => onChange(tf)}
        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
          value === tf
            ? 'bg-white text-blue-600 shadow-sm'
            : 'text-slate-500 hover:bg-slate-200'
        }`}
      >
        {tf}
      </button>
    ))}
  </div>
);

export default TimeFilterTabs;
