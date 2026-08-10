import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { HttpError, notFound } from '../http.js';
import { createRecurringSchema, updateRecurringSchema, uuid } from '../validation.js';

export const recurringRouter = Router();

/** See the note in routes/transactions.ts — the owner always comes from the session. */
function ownerId(req: Request): string {
    const id = req.session?.user.id;
    if (!id) throw new HttpError(401, 'Authentication required');
    return id;
}

interface RecurringRow {
    id: string;
    amount: number;
    category: string;
    description: string;
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    next_due_date: Date;
    type: 'EXPENSE' | 'INCOME';
    created_at: Date;
    updated_at: Date;
}

/** Row -> the camelCase shape the client's `RecurringExpense` interface expects. */
function toRecurring(row: RecurringRow) {
    return {
        id: row.id,
        amount: row.amount,
        category: row.category,
        description: row.description,
        frequency: row.frequency,
        nextDueDate: row.next_due_date.toISOString(),
        type: row.type,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

const RETURNING =
    'id, amount, category, description, frequency, next_due_date, type, created_at, updated_at';

/** camelCase field -> column, for the dynamic UPDATE below. */
const COLUMNS = {
    amount: 'amount',
    category: 'category',
    description: 'description',
    frequency: 'frequency',
    nextDueDate: 'next_due_date',
    type: 'type',
} as const;

/** GET /api/recurring — soonest due first. */
recurringRouter.get('/', async (req, res) => {
    const { rows } = await pool.query<RecurringRow>(
        `SELECT ${RETURNING} FROM recurring_transactions
         WHERE user_id = $1
         ORDER BY next_due_date ASC`,
        [ownerId(req)],
    );
    res.json({ data: rows.map(toRecurring) });
});

/** GET /api/recurring/:id */
recurringRouter.get('/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { rows } = await pool.query<RecurringRow>(
        `SELECT ${RETURNING} FROM recurring_transactions WHERE id = $1 AND user_id = $2`,
        [id, ownerId(req)],
    );
    const row = rows[0];
    if (!row) throw notFound('Recurring rule');
    res.json(toRecurring(row));
});

/** POST /api/recurring */
recurringRouter.post('/', async (req, res) => {
    const body = createRecurringSchema.parse(req.body);

    const { rows } = await pool.query<RecurringRow>(
        `INSERT INTO recurring_transactions
             (id, amount, category, description, frequency, next_due_date, type, user_id)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${RETURNING}`,
        [
            body.id ?? null,
            body.amount,
            body.category,
            body.description,
            body.frequency,
            body.nextDueDate,
            body.type,
            ownerId(req),
        ],
    );

    const row = rows[0];
    if (!row) throw new HttpError(500, 'Insert returned no row');
    res.status(201).json(toRecurring(row));
});

/** PUT /api/recurring/:id — partial update; advancing nextDueDate goes through here. */
recurringRouter.put('/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const body = updateRecurringSchema.parse(req.body);

    const sets: string[] = [];
    const params: unknown[] = [];

    for (const [field, column] of Object.entries(COLUMNS)) {
        const value = body[field as keyof typeof COLUMNS];
        if (value !== undefined) {
            params.push(value);
            sets.push(`${column} = $${params.length}`);
        }
    }

    params.push(id);
    const idParam = `$${params.length}`;
    params.push(ownerId(req));
    const { rows } = await pool.query<RecurringRow>(
        `UPDATE recurring_transactions SET ${sets.join(', ')}
         WHERE id = ${idParam} AND user_id = $${params.length}
         RETURNING ${RETURNING}`,
        params,
    );

    const row = rows[0];
    if (!row) throw notFound('Recurring rule');
    res.json(toRecurring(row));
});

/** DELETE /api/recurring/:id */
recurringRouter.delete('/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { rowCount } = await pool.query(
        'DELETE FROM recurring_transactions WHERE id = $1 AND user_id = $2',
        [id, ownerId(req)],
    );
    if (!rowCount) throw notFound('Recurring rule');
    res.status(204).end();
});
