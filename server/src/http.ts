import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

/** Postgres error codes we can translate into a meaningful status. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';
const PG_INVALID_TEXT_REPRESENTATION = '22P02';

function isPgError(err: unknown): err is { code: string; message: string } {
    return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

/**
 * express.json() rejects malformed or oversized bodies before any handler runs.
 * Those errors carry their own status and a `type` discriminator; without this
 * they would fall through to the catch-all and report 500 for a client mistake.
 */
function isBodyParserError(err: unknown): err is { status: number; type: string } {
    return (
        typeof err === 'object' &&
        err !== null &&
        typeof (err as { status?: unknown }).status === 'number' &&
        typeof (err as { type?: unknown }).type === 'string'
    );
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message, details: err.details });
        return;
    }

    if (err instanceof ZodError) {
        res.status(400).json({
            error: 'Validation failed',
            details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
    }

    if (isBodyParserError(err)) {
        switch (err.type) {
            case 'entity.too.large':
                res.status(413).json({ error: 'Request body too large' });
                return;
            case 'entity.parse.failed':
                res.status(400).json({ error: 'Malformed JSON body' });
                return;
            default:
                res.status(err.status).json({ error: 'Bad request' });
                return;
        }
    }

    if (isPgError(err)) {
        switch (err.code) {
            case PG_UNIQUE_VIOLATION:
                res.status(409).json({ error: 'A record with that id already exists' });
                return;
            case PG_CHECK_VIOLATION:
            case PG_INVALID_TEXT_REPRESENTATION:
                res.status(400).json({ error: 'Request violates a database constraint' });
                return;
        }
    }

    // Anything unrecognised is a bug on our side: log it in full, tell the
    // client nothing that could leak schema or credentials.
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
}
