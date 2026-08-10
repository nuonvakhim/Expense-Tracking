import { closePool, pool } from './db.js';
import { config, maskConnectionString } from './config.js';

/**
 * One-off upgrade helper: assigns every ownerless row to an existing account.
 *
 * Rows created before authentication existed have `user_id IS NULL`, and because
 * every API query filters on user_id they are invisible — present in the
 * database, absent from the app. Register the account that should own them, then:
 *
 *     npm run claim -- you@example.com
 *
 * Doing this as an explicit, argument-taking script rather than as part of
 * `migrate` is deliberate: silently handing historical financial records to
 * whichever account happened to register first is not a decision a migration
 * should make on its own.
 */

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
    console.error('Usage: npm run claim -- <email of the account that should own existing rows>');
    process.exit(2);
}

async function claim(targetEmail: string): Promise<void> {
    console.log(`[claim] connecting to ${maskConnectionString(config.databaseUrl)}`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query<{ id: string; email: string }>(
            'SELECT id, email FROM users WHERE lower(email) = $1',
            [targetEmail],
        );
        const user = rows[0];
        if (!user) {
            throw new Error(
                `No account with email ${targetEmail}. Register it in the app first, then re-run.`,
            );
        }

        const tx = await client.query('UPDATE transactions SET user_id = $1 WHERE user_id IS NULL', [
            user.id,
        ]);
        const rec = await client.query(
            'UPDATE recurring_transactions SET user_id = $1 WHERE user_id IS NULL',
            [user.id],
        );

        await client.query('COMMIT');

        console.log(`[claim] ${tx.rowCount ?? 0} transaction(s) and ${rec.rowCount ?? 0} recurring rule(s) now owned by ${user.email}`);
        console.log('[claim] re-run `npm run migrate` to enforce NOT NULL on user_id');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

claim(email)
    .then(() => closePool())
    .catch(async (err: unknown) => {
        console.error('[claim] failed:', err instanceof Error ? err.message : err);
        await closePool().catch(() => {});
        process.exit(1);
    });
