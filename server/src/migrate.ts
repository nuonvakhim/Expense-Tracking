import { pool, closePool } from './db.js';
import { config, maskConnectionString } from './config.js';
import { SCHEMA_SQL } from './schema.js';

async function migrate(): Promise<void> {
    console.log(`[migrate] connecting to ${maskConnectionString(config.databaseUrl)}`);
    const client = await pool.connect();
    try {
        // DDL is transactional in Postgres, so a failure halfway leaves nothing behind.
        await client.query('BEGIN');
        await client.query(SCHEMA_SQL);
        await client.query('COMMIT');
        console.log('[migrate] schema is up to date');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

migrate()
    .then(() => closePool())
    .catch(async (err: unknown) => {
        console.error('[migrate] failed:', err instanceof Error ? err.message : err);
        await closePool().catch(() => {});
        process.exit(1);
    });
