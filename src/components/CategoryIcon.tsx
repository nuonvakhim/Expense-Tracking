import React from 'react';
import { ExpenseCategory, IncomeCategory, type TransactionType } from '../../types';

// One glyph per category, drawn on the same 24px grid and stroke weight as the
// rest of the app's icons. Shapes are built from primitives (circles, rects,
// symmetric arcs) rather than pasted path data so they stay legible at the 20px
// the list renders them at, and so each one is centred on the same axis.
const GLYPHS: Record<string, React.ReactNode> = {
  // Fork (two tines joined by a bowl) and a knife with a curved blade.
  [ExpenseCategory.FOOD]: (
    <>
      <path d="M6.5 3.5v4.25a2.75 2.75 0 0 0 5.5 0V3.5" />
      <path d="M9.25 10.5V20.5" />
      <path d="M16.75 3.5v17" />
      <path d="M16.75 3.5c1.9 1.9 1.9 6.6 0 8.5" />
    </>
  ),
  // Car: cabin, body, two wheels on the body's lower edge.
  [ExpenseCategory.TRANSPORT]: (
    <>
      <path d="M6 15.5l1.7-5.1A2 2 0 0 1 9.6 9h4.8a2 2 0 0 1 1.9 1.4l1.7 5.1" />
      <path d="M4.5 15.5h15v3h-15z" />
      <circle cx="8" cy="18.5" r="1.4" />
      <circle cx="16" cy="18.5" r="1.4" />
    </>
  ),
  [ExpenseCategory.SHOPPING]: (
    <>
      <path d="M5.5 8.5h13l-1.1 11.2a1.5 1.5 0 0 1-1.5 1.3H8.1a1.5 1.5 0 0 1-1.5-1.3z" />
      <path d="M9 8.5V6.5a3 3 0 0 1 6 0v2" />
    </>
  ),
  [ExpenseCategory.ENTERTAINMENT]: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.5l6 3.5-6 3.5z" />
    </>
  ),
  [ExpenseCategory.UTILITIES]: <path d="M3.75 13.5 14.25 2.25 12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />,
  // First-aid kit rather than a heart: a heart reads as "favourite" in a list.
  [ExpenseCategory.HEALTH]: (
    <>
      <rect x="3.5" y="7" width="17" height="12" rx="2.5" />
      <path d="M9 7V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M12 10.5v5M9.5 13h5" />
    </>
  ),
  [ExpenseCategory.OTHER]: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),

  [IncomeCategory.SALARY]: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v4M18 10v4" />
    </>
  ),
  [IncomeCategory.FREELANCE]: (
    <>
      <rect x="5.5" y="5.5" width="13" height="10" rx="1.5" />
      <path d="M3 18.5h18" />
    </>
  ),
  [IncomeCategory.INVESTMENT]: (
    <>
      <path d="M3.5 16.5l5.5-5.5 3.5 3.5 7-7" />
      <path d="M14.5 7.5h5v5" />
    </>
  ),
  [IncomeCategory.GIFT]: (
    <>
      <rect x="3.5" y="9" width="17" height="11" rx="1.5" />
      <path d="M12 9v11" />
      <circle cx="9.4" cy="6.6" r="2.4" />
      <circle cx="14.6" cy="6.6" r="2.4" />
    </>
  ),
  [IncomeCategory.OTHER]: (
    <>
      <ellipse cx="12" cy="7.5" rx="7.5" ry="3" />
      <path d="M4.5 7.5v9c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-9" />
      <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </>
  ),
};

interface CategoryIconProps {
  category: string;
  type: TransactionType;
  className?: string;
}

// Categories are stored as free-form strings, so a record that predates a
// renamed category still renders something sensible for its direction.
const CategoryIcon: React.FC<CategoryIconProps> = ({ category, type, className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {GLYPHS[category] ?? GLYPHS[type === 'INCOME' ? IncomeCategory.OTHER : ExpenseCategory.OTHER]}
  </svg>
);

export default CategoryIcon;
