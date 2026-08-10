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

export interface AuthUser {
    id: string;
    email: string;
}

interface AuthPayload {
    user: AuthUser;
    csrfToken: string;
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

/**
 * The session itself lives in an httpOnly cookie the browser attaches on its own —
 * unreadable here, which is the point: script injected into this page cannot
 * steal it. What we do hold is the CSRF token, kept in memory only. Putting it in
 * localStorage would outlive the session and survive into another user's visit.
 */
let csrfToken: string | null = null;

/** Called when the server says the session is gone, so the UI can show the login screen. */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
    onUnauthorized = handler;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const method = (init?.method ?? 'GET').toUpperCase();

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
    };

    if (!SAFE_METHODS.has(method) && csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    let res: Response;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            ...init,
            headers,
            // Send the session cookie even though the API is a different origin.
            credentials: 'include',
        });
    } catch (err) {
        throw new ApiError(0, err instanceof Error ? err.message : 'Network error');
    }

    if (res.status === 401) {
        csrfToken = null;
        onUnauthorized?.();
        // Fall through so the caller still gets the server's message.
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

/** Stores the CSRF token that comes back with every authenticating response. */
function adoptSession(payload: AuthPayload): AuthUser {
    csrfToken = payload.csrfToken;
    return payload.user;
}

export const api = {
    // ---- auth ----

    register: async (email: string, password: string): Promise<AuthUser> =>
        adoptSession(
            await request<AuthPayload>('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            }),
        ),

    login: async (email: string, password: string): Promise<AuthUser> =>
        adoptSession(
            await request<AuthPayload>('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            }),
        ),

    /** Restores a session from the cookie on page load; throws ApiError(401) if there is none. */
    me: async (): Promise<AuthUser> => adoptSession(await request<AuthPayload>('/api/auth/me')),

    logout: async (): Promise<void> => {
        try {
            await request<void>('/api/auth/logout', { method: 'POST' });
        } finally {
            // Drop local state even if the call failed, so the UI cannot be left
            // looking signed in.
            csrfToken = null;
        }
    },

    changePassword: (currentPassword: string, newPassword: string): Promise<{ revokedSessions: number }> =>
        request('/api/auth/password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        }),

    // ---- records ----

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
