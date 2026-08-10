import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import {
    authAccountRateLimit,
    authRateLimit,
    requireAuth,
    requireCsrf,
} from '../auth/middleware.js';
import { burnPasswordTime, hashPassword, needsRehash, verifyPassword } from '../auth/password.js';
import {
    clearSessionCookie,
    createSession,
    readSessionCookie,
    revokeOtherSessions,
    revokeSession,
    setSessionCookie,
    type SessionUser,
} from '../auth/session.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../validation.js';

export const authRouter = Router();

interface UserRow {
    id: string;
    email: string;
    password_hash: string;
}

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: unknown }).code === PG_UNIQUE_VIOLATION
    );
}

/**
 * The shape every authenticating response returns. `csrfToken` is delivered in
 * the body, not in a cookie: the frontend is served from a different origin than
 * the API, so a host-only cookie would be unreadable to it, and a body-delivered
 * token held in memory is stronger than double-submit anyway.
 */
function authPayload(user: SessionUser, csrfToken: string) {
    return { user: { id: user.id, email: user.email }, csrfToken };
}

/** POST /api/auth/register */
authRouter.post('/register', authRateLimit, authAccountRateLimit, async (req, res) => {
    if (!config.allowRegistration) {
        throw new HttpError(403, 'Registration is closed on this server');
    }

    const body = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);

    let row: { id: string; email: string } | undefined;
    try {
        const result = await pool.query<{ id: string; email: string }>(
            `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
            [body.email, passwordHash],
        );
        row = result.rows[0];
    } catch (err) {
        if (isUniqueViolation(err)) {
            throw new HttpError(409, 'An account with that email address already exists');
        }
        throw err;
    }

    if (!row) throw new HttpError(500, 'User insert returned no row');

    const session = await createSession(row);
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json(authPayload(row, session.csrfToken));
});

/** POST /api/auth/login */
authRouter.post('/login', authRateLimit, authAccountRateLimit, async (req, res) => {
    const body = loginSchema.parse(req.body);

    const { rows } = await pool.query<UserRow>(
        `SELECT id, email, password_hash FROM users WHERE lower(email) = $1`,
        [body.email],
    );
    const user = rows[0];

    if (!user) {
        // Spend the same time as a real verification so response latency does
        // not reveal whether the address is registered.
        await burnPasswordTime(body.password);
        throw new HttpError(401, 'Invalid email address or password');
    }

    if (!(await verifyPassword(body.password, user.password_hash))) {
        throw new HttpError(401, 'Invalid email address or password');
    }

    // Cost parameters were raised since this hash was made: upgrade it now that
    // the plaintext is legitimately in hand.
    if (needsRehash(user.password_hash)) {
        const upgraded = await hashPassword(body.password);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [upgraded, user.id]);
    }

    const session = await createSession(user);
    setSessionCookie(res, session.token, session.expiresAt);
    res.json(authPayload(user, session.csrfToken));
});

/**
 * GET /api/auth/me — who am I, and what CSRF token should I use?
 * The frontend calls this on load to restore a session from the cookie.
 */
authRouter.get('/me', requireAuth, (req, res) => {
    const session = req.session;
    if (!session) throw new HttpError(401, 'Authentication required');
    res.json(authPayload(session.user, session.csrfToken));
});

/** POST /api/auth/logout — revokes the session server-side, not just the cookie. */
authRouter.post('/logout', requireAuth, requireCsrf, async (req, res) => {
    await revokeSession(readSessionCookie(req.cookies));
    clearSessionCookie(res);
    res.status(204).end();
});

/** POST /api/auth/password — change password and sign every other device out. */
authRouter.post('/password', requireAuth, requireCsrf, async (req, res) => {
    const session = req.session;
    if (!session) throw new HttpError(401, 'Authentication required');

    const body = changePasswordSchema.parse(req.body);

    const { rows } = await pool.query<Pick<UserRow, 'password_hash'>>(
        'SELECT password_hash FROM users WHERE id = $1',
        [session.user.id],
    );
    const current = rows[0];
    if (!current) throw new HttpError(401, 'Authentication required');

    if (!(await verifyPassword(body.currentPassword, current.password_hash))) {
        throw new HttpError(403, 'Current password is incorrect');
    }

    const passwordHash = await hashPassword(body.newPassword);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        passwordHash,
        session.user.id,
    ]);

    // A password change is how a user responds to a suspected compromise, so it
    // has to invalidate sessions the attacker may hold. The current one survives.
    const revoked = await revokeOtherSessions(session.user.id, session.id);
    res.json({ revokedSessions: revoked });
});
