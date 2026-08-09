import type { Expense, RecurrenceFrequency, RecurringExpense, TransactionType } from '../../types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.vakhim-dev.site').replace(/\/+$/, '');

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            ...init,
            headers: { 'Content-Type': 'application/json', ...init?.headers },
        });
    } catch (err) {
        throw new ApiError(0, err instanceof Error ? err.message : 'Network error');
    }

    if (res.status === 204) return undefined as T;

    const body: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
        const message =
            body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
                ? body.error
                : `Request failed with status ${res.status}`;
        const details = body && typeof body === 'object' && 'details' in body ? body.details : undefined;
        throw new ApiError(res.status, message, details);
    }

    return body as T;
}

export const api = {
    listTransactions: (): Promise<ListResponse<Expense>> => request('/api/transactions'),

    createTransaction: (input: NewTransaction): Promise<Expense> =>
        request('/api/transactions', { method: 'POST', body: JSON.stringify(input) }),

    updateTransaction: (id: string, patch: Partial<NewTransaction>): Promise<Expense> =>
        request(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),

    deleteTransaction: (id: string): Promise<void> =>
        request(`/api/transactions/${id}`, { method: 'DELETE' }),

    listRecurring: (): Promise<{ data: RecurringExpense[] }> => request('/api/recurring'),

    createRecurring: (input: NewRecurring): Promise<RecurringExpense> =>
        request('/api/recurring', { method: 'POST', body: JSON.stringify(input) }),

    updateRecurring: (id: string, patch: Partial<NewRecurring>): Promise<RecurringExpense> =>
        request(`/api/recurring/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),

    deleteRecurring: (id: string): Promise<void> =>
        request(`/api/recurring/${id}`, { method: 'DELETE' }),
};
