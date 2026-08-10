import type { NextFunction, Request, RequestHandler, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { HttpError } from '../http.js';
import { csrfTokenMatches, loadSession, readSessionCookie, type Session } from './session.js';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** Set by requireAuth; absent means the request is unauthenticated. */
            session?: Session;
        }
    }
}

/** Methods that must not change state, and so need no CSRF token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CSRF_HEADER = 'x-csrf-token';

/**
 * Rejects a state-changing request whose `Origin` is not an allowed frontend.
 *
 * Browsers always send `Origin` on cross-site POST/PUT/DELETE — including form
 * submissions — so this alone stops classic CSRF. It is applied as defence in
 * depth alongside the per-session token, and notably it also covers login,
 * which has no session token to check yet.
 *
 * A missing `Origin` is allowed through: non-browser callers (curl, health
 * probes, tests) do not send one, and they are not subject to CSRF because
 * nothing is attaching cookies on their behalf.
 */
export function originGuard(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }

    const origin = req.get('origin');
    if (origin && !config.corsOrigins.includes(origin)) {
        next(new HttpError(403, 'Request origin is not allowed'));
        return;
    }

    next();
}

/** Resolves the session cookie, or 401. */
export const requireAuth: RequestHandler = (req, _res, next) => {
    const token = readSessionCookie(req.cookies);
    if (!token) {
        next(new HttpError(401, 'Authentication required'));
        return;
    }

    loadSession(token)
        .then((session) => {
            if (!session) {
                // Expired, revoked, or forged — deliberately the same message.
                next(new HttpError(401, 'Authentication required'));
                return;
            }
            req.session = session;
            next();
        })
        .catch(next);
};

/**
 * Synchronizer-token CSRF check. The token lives in the session row and is
 * handed to the client in the response body of login/register/me, so the client
 * keeps it in memory rather than in a readable cookie. An attacker's page can
 * make the browser send the session cookie, but it cannot read the token or set
 * a custom header on a cross-site form post.
 */
export const requireCsrf: RequestHandler = (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
        next();
        return;
    }

    const session = req.session;
    if (!session) {
        next(new HttpError(401, 'Authentication required'));
        return;
    }

    if (!csrfTokenMatches(session.csrfToken, req.get(CSRF_HEADER))) {
        next(new HttpError(403, 'Missing or invalid CSRF token'));
        return;
    }

    next();
};

function limitHandler(message: string) {
    return (_req: Request, _res: Response, next: NextFunction): void => {
        next(new HttpError(429, message));
    };
}

const windowMs = config.rateLimit.windowMinutes * 60_000;

/** Broad ceiling on all API traffic from one address. */
export const apiRateLimit = rateLimit({
    windowMs,
    limit: config.rateLimit.apiMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: limitHandler('Too many requests. Please slow down and try again shortly.'),
});

/** Tight ceiling on credential endpoints, keyed by address. */
export const authRateLimit = rateLimit({
    windowMs,
    limit: config.rateLimit.authMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // A successful login should not consume the budget a real user needs.
    skipSuccessfulRequests: true,
    handler: limitHandler('Too many authentication attempts. Please try again later.'),
});

/**
 * Second ceiling keyed by the submitted email, so spreading an attack across
 * many source addresses does not multiply the guesses against one account.
 * Runs after express.json(), so req.body is available.
 */
export const authAccountRateLimit = rateLimit({
    windowMs,
    limit: config.rateLimit.authPerAccountMax,
    standardHeaders: false,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request): string => {
        const email = (req.body as { email?: unknown } | undefined)?.email;
        return typeof email === 'string' ? `email:${email.trim().toLowerCase()}` : 'email:absent';
    },
    handler: limitHandler('Too many authentication attempts for this account. Please try again later.'),
});
