import type { Expense, RecurrenceFrequency, RecurringExpense, TransactionType } from '../../types';

const EXPENSES_KEY = 'expenses';
const RECURRING_KEY = 'recurring';

export class ApiError extends Error {
    readonly status: number;
    readonly details?: unknown;

    constructor(status: number, message: string, details?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }
}

export type NewTransaction = {
    id?: string;
    amount: number;
    category: string;
    description: string;
    date: string;
    type: TransactionType;
};

export type NewRecurring = {
    id?: string;
    amount: number;
    category: string;
    description: string;
    frequency: RecurrenceFrequency;
    nextDueDate: string;
    type: TransactionType;
};

interface ListResponse<T> {
    data: T[];
    total: number;
}

function read<T>(key: string): T[] {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function write<T>(key: string, data: T[]): void {
    localStorage.setItem(key, JSON.stringify(data));
}

function newId(): string {
    return crypto.randomUUID();
}

function notFound(entity: string): never {
    throw new ApiError(404, `${entity} not found`);
}

function conflict(message: string): never {
    throw new ApiError(409, message);
}

export const api = {
    listTransactions: async (): Promise<ListResponse<Expense>> => {
        const data = read<Expense>(EXPENSES_KEY);
        return { data, total: data.length };
    },

    createTransaction: async (input: NewTransaction): Promise<Expense> => {
        const expenses = read<Expense>(EXPENSES_KEY);
        const id = input.id ?? newId();
        if (expenses.some((e) => e.id === id)) conflict('Transaction already exists');

        const created: Expense = {
            id,
            amount: input.amount,
            category: input.category,
            description: input.description,
            date: input.date,
            type: input.type,
        };
        write(EXPENSES_KEY, [created, ...expenses]);
        return created;
    },

    updateTransaction: async (id: string, patch: Partial<NewTransaction>): Promise<Expense> => {
        const expenses = read<Expense>(EXPENSES_KEY);
        const index = expenses.findIndex((e) => e.id === id);
        if (index === -1) notFound('Transaction');

        const updated: Expense = { ...expenses[index], ...patch, id };
        expenses[index] = updated;
        write(EXPENSES_KEY, expenses);
        return updated;
    },

    deleteTransaction: async (id: string): Promise<void> => {
        const expenses = read<Expense>(EXPENSES_KEY);
        const next = expenses.filter((e) => e.id !== id);
        if (next.length === expenses.length) notFound('Transaction');
        write(EXPENSES_KEY, next);
    },

    listRecurring: async (): Promise<{ data: RecurringExpense[] }> => ({
        data: read<RecurringExpense>(RECURRING_KEY),
    }),

    createRecurring: async (input: NewRecurring): Promise<RecurringExpense> => {
        const rules = read<RecurringExpense>(RECURRING_KEY);
        const id = input.id ?? newId();
        if (rules.some((r) => r.id === id)) conflict('Recurring rule already exists');

        const created: RecurringExpense = {
            id,
            amount: input.amount,
            category: input.category,
            description: input.description,
            frequency: input.frequency,
            nextDueDate: input.nextDueDate,
            type: input.type,
        };
        write(RECURRING_KEY, [...rules, created]);
        return created;
    },

    updateRecurring: async (id: string, patch: Partial<NewRecurring>): Promise<RecurringExpense> => {
        const rules = read<RecurringExpense>(RECURRING_KEY);
        const index = rules.findIndex((r) => r.id === id);
        if (index === -1) notFound('Recurring rule');

        const updated: RecurringExpense = { ...rules[index], ...patch, id };
        rules[index] = updated;
        write(RECURRING_KEY, rules);
        return updated;
    },

    deleteRecurring: async (id: string): Promise<void> => {
        const rules = read<RecurringExpense>(RECURRING_KEY);
        const next = rules.filter((r) => r.id !== id);
        if (next.length === rules.length) notFound('Recurring rule');
        write(RECURRING_KEY, next);
    },
};
