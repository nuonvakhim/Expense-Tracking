export interface Expense {
    id: string;
    amount: number;
    category: string;
    description: string;
    date: string; // ISO String
    type: TransactionType;
}

export interface ExpenseSummary {
    total: number;
    byCategory: { name: string; value: number; color: string }[];
}

export const ExpenseCategory = {
    FOOD: 'Food & Drink',
    TRANSPORT: 'Transport',
    SHOPPING: 'Shopping',
    ENTERTAINMENT: 'Entertainment',
    UTILITIES: 'Utilities',
    HEALTH: 'Health',
    OTHER: 'Other'
} as const;

export type ExpenseCategory = typeof ExpenseCategory[keyof typeof ExpenseCategory];

export const IncomeCategory = {
    SALARY: 'Salary',
    FREELANCE: 'Freelance',
    INVESTMENT: 'Investment',
    GIFT: 'Gift',
    OTHER: 'Other Income'
} as const;

export type IncomeCategory = typeof IncomeCategory[keyof typeof IncomeCategory];

export type TransactionType = 'EXPENSE' | 'INCOME';

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurringExpense {
    id: string;
    amount: number;
    category: string;
    description: string;
    frequency: RecurrenceFrequency;
    nextDueDate: string; // ISO String
    type: TransactionType;
}

export const CATEGORY_COLORS: Record<string, string> = {
    [ExpenseCategory.FOOD]: '#ef4444', // red-500
    [ExpenseCategory.TRANSPORT]: '#f97316', // orange-500
    [ExpenseCategory.SHOPPING]: '#3b82f6', // blue-500
    [ExpenseCategory.ENTERTAINMENT]: '#8b5cf6', // violet-500
    [ExpenseCategory.UTILITIES]: '#10b981', // emerald-500
    [ExpenseCategory.HEALTH]: '#ec4899', // pink-500
    [ExpenseCategory.OTHER]: '#64748b', // slate-500

    // Income Colors
    [IncomeCategory.SALARY]: '#059669', // emerald-600
    [IncomeCategory.FREELANCE]: '#2563eb', // blue-600
    [IncomeCategory.INVESTMENT]: '#7c3aed', // violet-600
    [IncomeCategory.GIFT]: '#db2777', // pink-600
    [IncomeCategory.OTHER]: '#475569', // slate-600
};
