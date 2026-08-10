import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config, maskConnectionString } from './config.js';
import { closePool, pool } from './db.js';
import { errorHandler, HttpError } from './http.js';
import {
    apiRateLimit,
    CSRF_HEADER,
    originGuard,
    requireAuth,
    requireCsrf,
} from './auth/middleware.js';
import { deleteExpiredSessions } from './auth/session.js';
import { authRouter } from './routes/auth.js';
import { transactionsRouter } from './routes/transactions.js';
import { recurringRouter } from './routes/recurring.js';

const app = express();

app.disable('x-powered-by');

// Governs req.ip, and therefore what the rate limiter counts. Must be set when
// deployed behind the nginx reverse proxy, and must NOT be set otherwise —
// see the note on trustProxy() in config.ts.
app.set('trust proxy', config.trustProxy);

// Security response headers. This is a JSON API that should never be framed,
// sniffed, or treated as a document, so the CSP denies everything by default.
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                'default-src': ["'none'"],
                'frame-ancestors': ["'none'"],
                'base-uri': ["'none'"],
                'form-action': ["'none'"],
            },
        },
        // Both the frontend and the API live under the same registrable domain.
        crossOriginResourcePolicy: { policy: 'same-site' },
        referrerPolicy: { policy: 'no-referrer' },
        // Only meaningful over HTTPS; the TLS terminator in front may also set it.
        hsts: config.isProduction,
    }),
);

// Credentialed CORS: the browser sends the session cookie, so the allowed origin
// list must be explicit (config.ts refuses "*") and the CSRF header must be
// allowed through preflight.
app.use(
    cors({
        origin: config.corsOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
        maxAge: 600,
    }),
);

// Transactions are small; a low cap keeps oversized bodies from being parsed at all.
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

/** Liveness + database reachability. Deliberately ahead of the rate limiter so a container health probe can never be throttled. */
app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        // The driver's message can name hosts, ports, and roles — log it, don't publish it.
        console.error('[api] health check failed:', err instanceof Error ? err.message : err);
        res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
});

// Financial records and anything carrying a session must not sit in a shared or
// browser cache, or in a proxy's store.
app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

app.use('/api', apiRateLimit);
app.use(originGuard);

app.use('/api/auth', authRouter);

// Everything past this point requires a valid session, and every state-changing
// request additionally requires the session's CSRF token in `X-CSRF-Token`.
app.use('/api/transactions', requireAuth, requireCsrf, transactionsRouter);
app.use('/api/recurring', requireAuth, requireCsrf, recurringRouter);

app.use((req, _res, next) => {
    // Echoing the URL back would reflect attacker-controlled text; the method and
    // path are enough for a client to debug its own call.
    next(new HttpError(404, `No route for ${req.method} ${req.path}`));
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port} (${config.nodeEnv})`);
    console.log(`[api] database ${maskConnectionString(config.databaseUrl)}`);
    console.log(`[api] cors origins: ${config.corsOrigins.join(', ')}`);
    console.log(
        `[api] session cookie "${config.session.cookieName}": httpOnly, ` +
        `secure=${config.session.cookieSecure}, sameSite=${config.session.cookieSameSite}, ` +
        `ttl=${config.session.ttlHours}h`,
    );
    console.log(`[api] csrf header: ${CSRF_HEADER}; registration open: ${config.allowRegistration}`);
});

// Expired sessions are already unusable — this only stops the table growing
// forever. unref() so it never holds the process open during shutdown.
const sessionSweep = setInterval(() => {
    deleteExpiredSessions()
        .then((removed) => {
            if (removed > 0) console.log(`[api] swept ${removed} expired session(s)`);
        })
        .catch((err: unknown) => {
            console.error('[api] session sweep failed:', err instanceof Error ? err.message : err);
        });
}, 3_600_000);
sessionSweep.unref();

/** Stop accepting connections, drain in-flight requests, then close the pool. */
function shutdown(signal: string): void {
    console.log(`[api] ${signal} received, shutting down`);
    clearInterval(sessionSweep);
    server.close(() => {
        closePool()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
