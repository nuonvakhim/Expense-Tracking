import pg from 'pg';
import { config } from './config.js';

// pg returns NUMERIC as a string to protect precision on arbitrary-precision
// values. Our amounts are 2dp money well inside IEEE-754 safe range, and the
// client contract in types.ts is `amount: number`, so parse it back.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => Number(value));

export const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    // Default to verifying the server certificate. If your provider serves a
    // self-signed chain and you get SELF_SIGNED_CERT_IN_CHAIN, see server/README.md.
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
    max: 10,
    // Every wait is bounded — no unbounded blocking on a slow or dead database,
    // and node-postgres does not retry a failed query on its own.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
    query_timeout: 15_000,
});

// A pooled client can drop out from under us (network blip, provider restart).
// Without a listener this is an unhandled 'error' event and takes the process down.
pool.on('error', (err) => {
    console.error('[db] idle client error:', err.message);
});

export async function closePool(): Promise<void> {
    await pool.end();
}
