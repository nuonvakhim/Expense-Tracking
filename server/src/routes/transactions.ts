import { Router, type Request } from 'express';
import { pool } from '../db.js';
import { HttpError, notFound } from '../http.js';
import {
    createTransactionSchema,
    listQuerySchema,
    updateTransactionSchema,
    uuid,
} from '../validation.js';

export const transactionsRouter = Router();

/**
 * Every statement below filters on user_id, and it is always taken from the
 * session rather than from anything the client sent. That is what makes a
 * transaction id unguessable-and-irrelevant: quoting another user's id in a URL
 * yields the same 404 as an id that does not exist.
 */
function ownerId(req: Request): string {
    const id = req.session?.user.id;
    // requireAuth runs ahead of this router, so a missing session is a wiring
    // bug. Failing closed beats silently querying across all users.
    if (!id) throw new HttpError(401, 'Authentication required');
    return id;
}

interface TransactionRow {
    id: string;
    amount: number;
    category: string;
    description: string;
    date: Date;
    type: 'EXPENSE' | 'INCOME';
    created_at: Date;
    updated_at: Date;
}

/** Row -> the camelCase shape the client's `Expense` interface expects. */
function toTransaction(row: TransactionRow) {
    return {
        id: row.id,
        amount: row.amount,
        category: row.category,
        description: row.description,
        date: row.date.toISOString(),
        type: row.type,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

const RETURNING = 'id, amount, category, description, date, type, created_at, updated_at';

/** GET /api/transactions — newest first, with optional filters + pagination. */
transactionsRouter.get('/', async (req, res) => {
    const q = listQuerySchema.parse(req.query);

    // The owner filter is not optional and is always $1.
    const params: unknown[] = [ownerId(req)];
    const where: string[] = ['user_id = $1'];

    if (q.type) {
        params.push(q.type);
        where.push(`type = $${params.length}`);
    }
    if (q.category) {
        params.push(q.category);
        where.push(`category = $${params.length}`);
    }
    if (q.from) {
        params.push(q.from);
        where.push(`date >= $${params.length}`);
    }
    if (q.to) {
        params.push(q.to);
        where.push(`date <= $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    params.push(q.limit);
    const limitParam = `$${params.length}`;
    params.push(q.offset);
    const offsetParam = `$${params.length}`;

    const [rows, count] = await Promise.all([
        pool.query<TransactionRow>(
            `SELECT ${RETURNING} FROM transactions ${whereSql}
             ORDER BY date DESC, created_at DESC
             LIMIT ${limitParam} OFFSET ${offsetParam}`,
            params,
        ),
        pool.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM transactions ${whereSql}`,
            // The count shares the filters but not limit/offset.
            params.slice(0, params.length - 2),
        ),
    ]);

    res.json({
        data: rows.rows.map(toTransaction),
        total: Number(count.rows[0]?.count ?? 0),
        limit: q.limit,
        offset: q.offset,
    });
});

/** GET /api/transactions/:id */
transactionsRouter.get('/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { rows } = await pool.query<TransactionRow>(
        `SELECT ${RETURNING} FROM transactions WHERE id = $1 AND user_id = $2`,
        [id, ownerId(req)],
    );
    const row = rows[0];
    if (!row) throw notFound('Transaction');
    res.json(toTransaction(row));
});

/** POST /api/transactions */
transactionsRouter.post('/', async (req, res) => {
    const body = createTransactionSchema.parse(req.body);

    const { rows } = await pool.query<TransactionRow>(
        `INSERT INTO transactions (id, amount, category, description, date, type, user_id)
         VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7)
         RETURNING ${RETURNING}`,
        [
            body.id ?? null,
            body.amount,
            body.category,
            body.description,
            body.date,
            body.type,
            ownerId(req),
        ],
    );

    const row = rows[0];
    if (!row) throw new HttpError(500, 'Insert returned no row');
    res.status(201).json(toTransaction(row));
});

/** PUT /api/transactions/:id — partial update; only provided fields change. */
transactionsRouter.put('/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const body = updateTransactionSchema.parse(req.body);

    const sets: string[] = [];
    const params: unknown[] = [];

    for (const field of ['amount', 'category', 'description', 'date', 'type'] as const) {
        const value = body[field];
        if (value !== undefined) {
            params.push(value);
            sets.push(`${field} = $${params.length}`);
        }
    }

    params.push(id);
    const idParam = `$${params.length}`;
    params.push(ownerId(req));
    const { rows } = await pool.query<TransactionRow>(
        `UPDATE transactions SET ${sets.join(', ')}
         WHERE id = ${idParam} AND user_id = $${params.length}
         RETURNING ${RETURNING}`,
        params,
    );

    const row = rows[0];
    if (!row) throw notFound('Transaction');
    res.json(toTransaction(row));
});

/** DELETE /api/transactions/:id */
transactionsRouter.delete('/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { rowCount } = await pool.query(
        'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
        [id, ownerId(req)],
    );
    if (!rowCount) throw notFound('Transaction');
    res.status(204).end();
});
