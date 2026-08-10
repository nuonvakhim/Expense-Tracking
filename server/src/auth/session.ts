import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';

/**
 * Sessions are opaque random tokens kept in Postgres, not signed JWTs, so that
 * logout and "log out everywhere after a password change" revoke access
 * immediately instead of leaving a valid token in the wild until it expires.
 */

// 256 bits of entropy — not guessable, and not worth rate-limiting lookups over.
const TOKEN_BYTES = 32;
const CSRF_BYTES = 32;

/**
 * The cookie value is hashed before storage. SHA-256 with no salt or stretching
 * is the right primitive here (unlike for passwords): the input is already 256
 * random bits, so there is no dictionary to attack, and lookups stay a single
 * indexed probe.
 */
function hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface SessionUser {
    id: string;
    email: string;
}

export interface Session {
    id: string;
    user: SessionUser;
    csrfToken: string;
}

export interface IssuedSession extends Session {
    /** Plaintext token — set on the cookie and never stored or logged. */
    token: string;
    expiresAt: Date;
}

export async function createSession(user: SessionUser): Promise<IssuedSession> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const csrfToken = randomBytes(CSRF_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + config.session.ttlHours * 3_600_000);

    const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [user.id, hashToken(token), csrfToken, expiresAt],
    );

    const row = rows[0];
    if (!row) throw new Error('Session insert returned no row');

    return { id: row.id, user, csrfToken, token, expiresAt };
}

interface SessionRow {
    session_id: string;
    csrf_token: string;
    user_id: string;
    email: string;
}

/**
 * Validates a token and refreshes `last_seen_at` in one round trip. Expired rows
 * simply do not match, so an expired session is indistinguishable from an
 * unknown one.
 */
export async function loadSession(token: string): Promise<Session | null> {
    if (!token) return null;

    const { rows } = await pool.query<SessionRow>(
        `WITH touched AS (
             UPDATE sessions
                SET last_seen_at = now()
              WHERE token_hash = $1
                AND expires_at > now()
             RETURNING id, user_id, csrf_token
         )
         SELECT t.id AS session_id, t.csrf_token, u.id AS user_id, u.email
           FROM touched t
           JOIN users u ON u.id = t.user_id`,
        [hashToken(token)],
    );

    const row = rows[0];
    if (!row) return null;

    return {
        id: row.session_id,
        csrfToken: row.csrf_token,
        user: { id: row.user_id, email: row.email },
    };
}

export async function revokeSession(token: string): Promise<void> {
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/** Used after a password change: every other device has to sign in again. */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
    const { rowCount } = await pool.query(
        'DELETE FROM sessions WHERE user_id = $1 AND id <> $2',
        [userId, keepSessionId],
    );
    return rowCount ?? 0;
}

export async function deleteExpiredSessions(): Promise<number> {
    const { rowCount } = await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
    return rowCount ?? 0;
}

/** Constant-time CSRF token comparison. */
export function csrfTokenMatches(expected: string, provided: unknown): boolean {
    if (typeof provided !== 'string' || provided.length === 0) return false;
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

function cookieOptions(): CookieOptions {
    return {
        httpOnly: true, // unreadable from JavaScript, so XSS cannot exfiltrate it
        secure: config.session.cookieSecure,
        sameSite: config.session.cookieSameSite,
        domain: config.session.cookieDomain,
        path: '/',
    };
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(config.session.cookieName, token, { ...cookieOptions(), expires: expiresAt });
}

export function clearSessionCookie(res: Response): void {
    // Attributes must match the ones used to set it or the browser keeps the cookie.
    res.clearCookie(config.session.cookieName, cookieOptions());
}

export function readSessionCookie(cookies: unknown): string {
    if (typeof cookies !== 'object' || cookies === null) return '';
    const value = (cookies as Record<string, unknown>)[config.session.cookieName];
    return typeof value === 'string' ? value : '';
}
