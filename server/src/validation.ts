import { z } from 'zod';

/**
 * Mirrors the client contract in the repo-root types.ts (TransactionType,
 * RecurrenceFrequency, Expense, RecurringExpense). That file is the source of
 * truth for shape; it is duplicated rather than imported so this package stays
 * self-contained and its tsc rootDir stays clean.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuid = z.string().regex(UUID_RE, 'must be a UUID');

// Hand-rolled rather than z.iso.datetime() so this holds across zod 3 and 4,
// whose ISO helpers live at different paths.
const isoDateString = z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'must be an ISO 8601 date string');

const transactionType = z.enum(['EXPENSE', 'INCOME']);
const frequency = z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

// NUMERIC(14,2) tops out at 12 integer digits; reject above that here so the
// client gets a 400 with a clear message instead of a database error.
const amount = z
    .number()
    .refine(Number.isFinite, 'must be a finite number')
    .positive('must be greater than 0')
    .max(999_999_999_999.99, 'exceeds the maximum supported amount');

const category = z.string().trim().min(1, 'is required').max(64);
const description = z.string().trim().min(1, 'is required').max(500);

export const createTransactionSchema = z.object({
    // Optional so the client may keep the id it already generated with
    // crypto.randomUUID(); omitted means Postgres assigns one.
    id: uuid.optional(),
    amount,
    category,
    description,
    date: isoDateString,
    type: transactionType,
});

// Every field optional, but at least one must be present — otherwise the UPDATE
// would have an empty SET clause.
export const updateTransactionSchema = createTransactionSchema
    .omit({ id: true })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'at least one field must be provided');

export const createRecurringSchema = z.object({
    id: uuid.optional(),
    amount,
    category,
    description,
    frequency,
    nextDueDate: isoDateString,
    type: transactionType,
});

export const updateRecurringSchema = createRecurringSchema
    .omit({ id: true })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'at least one field must be provided');

/**
 * Credentials.
 *
 * The email pattern is deliberately conservative rather than RFC-5322 complete —
 * it exists to reject obvious junk, and the 254-character cap matches the
 * `users.email` CHECK constraint so a long value fails as a 400 rather than a
 * database error.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const email = z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'is required')
    .max(254, 'is too long')
    .regex(EMAIL_RE, 'must be a valid email address');

/**
 * Length is the only rule. Composition rules ("one digit, one symbol") shrink
 * the search space users actually pick from and push them toward `Password1!`;
 * a 12-character minimum with no other constraints is the current guidance.
 * The 200-character cap bounds hashing work per request.
 */
export const password = z
    .string()
    .min(12, 'must be at least 12 characters')
    .max(200, 'must be at most 200 characters');

export const registerSchema = z.object({ email, password });

// No minimum on login: an old or short password must still be able to sign in,
// and rejecting it here would tell an attacker the format is wrong.
export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().min(1, 'is required').max(254),
    password: z.string().min(1, 'is required').max(200),
});

export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'is required').max(200),
        newPassword: password,
    })
    .refine((v) => v.currentPassword !== v.newPassword, {
        message: 'must differ from the current password',
        path: ['newPassword'],
    });

export const listQuerySchema = z.object({
    type: transactionType.optional(),
    category: category.optional(),
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    limit: z.coerce.number().int().positive().max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
});

export type Register = z.infer<typeof registerSchema>;
export type Login = z.infer<typeof loginSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type CreateTransaction = z.infer<typeof createTransactionSchema>;
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;
export type CreateRecurring = z.infer<typeof createRecurringSchema>;
export type UpdateRecurring = z.infer<typeof updateRecurringSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
