import React from 'react';

export type MainTab = 'HOME' | 'HISTORY';

interface BottomNavProps {
  active: MainTab;
  onChange: (tab: MainTab) => void;
}

// Icons are built from plain geometry on a 24px grid rather than pasted path
// data, so both sit on the same optical baseline and share a stroke weight.
// The selected tab thickens its stroke and picks up a translucent fill — the
// colour change alone is easy to miss on a small screen.
const iconProps = (active: boolean) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: active ? 2.1 : 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'w-6 h-6',
});

const HomeIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg {...iconProps(active)}>
    {active && <path d="M5.5 10h13v10.25h-13z" fill="currentColor" stroke="none" opacity={0.14} />}
    {/* Roof, then the two walls and floor, then the doorway. */}
    <path d="M3.25 10.75 12 3.5l8.75 7.25" />
    <path d="M5.5 9.75V20.25h13V9.75" />
    <path d="M9.75 20.25V14.5h4.5v5.75" />
  </svg>
);

const HistoryIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg {...iconProps(active)}>
    {active && <circle cx="12" cy="12" r="8" fill="currentColor" stroke="none" opacity={0.14} />}
    <circle cx="12" cy="12" r="8" />
    {/* Minute hand to ~69% of the radius, hour hand to ~49% — shorter than this
        and the hands read as stubby against a face this size. */}
    <path d="M12 6.5V12l3.4 1.9" />
  </svg>
);

const TABS: { id: MainTab; label: string; Icon: React.FC<{ active: boolean }> }[] = [
  { id: 'HOME', label: 'Home', Icon: HomeIcon },
  { id: 'HISTORY', label: 'History', Icon: HistoryIcon },
];

const BottomNav: React.FC<BottomNavProps> = ({ active, onChange }) => (
  <nav
    role="tablist"
    aria-label="Sections"
    className="fixed bottom-0 inset-x-0 z-20 bg-white/90 backdrop-blur-md border-t border-slate-200"
    // Keeps the labels clear of the iOS home indicator.
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    <div className="max-w-md mx-auto px-4 py-1.5 flex">
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            id={`tab-${id.toLowerCase()}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${id.toLowerCase()}`}
            onClick={() => onChange(id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors ${
              isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Icon active={isActive} />
            <span className={`text-[11px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  </nav>
);

export default BottomNav;
