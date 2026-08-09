import express from 'express';
import cors from 'cors';
import { config, maskConnectionString } from './config.js';
import { closePool, pool } from './db.js';
import { errorHandler, HttpError } from './http.js';
import { transactionsRouter } from './routes/transactions.js';
import { recurringRouter } from './routes/recurring.js';

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigins }));
// Transactions are small; a low cap keeps oversized bodies from being parsed at all.
app.use(express.json({ limit: '64kb' }));

/** Liveness + database reachability. */
app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(503).json({
            status: 'degraded',
            database: 'unreachable',
            error: err instanceof Error ? err.message : 'unknown error',
        });
    }
});

app.use('/api/transactions', transactionsRouter);
app.use('/api/recurring', recurringRouter);

app.use((req, _res, next) => {
    next(new HttpError(404, `No route for ${req.method} ${req.originalUrl}`));
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
    console.log(`[api] database ${maskConnectionString(config.databaseUrl)}`);
    console.log(`[api] cors origins: ${config.corsOrigins.join(', ')}`);
});

/** Stop accepting connections, drain in-flight requests, then close the pool. */
function shutdown(signal: string): void {
    console.log(`[api] ${signal} received, shutting down`);
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
