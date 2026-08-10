/**
 * Schema is kept here rather than in a .sql file so that `tsc` output in dist/
 * is self-contained — no asset-copy step, no runtime path resolution.
 *
 * Every statement is idempotent, so migrate can be re-run safely.
 */
export const SCHEMA_SQL = `
-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Stored already lower-cased and trimmed by the app; the unique index below
    -- is what actually prevents two accounts differing only in case.
    email         TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- Server-side sessions rather than self-contained tokens, so that logging out
-- (and "log out everywhere" after a password change) actually revokes access
-- instead of waiting for an expiry to pass.
CREATE TABLE IF NOT EXISTS sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Only the SHA-256 of the cookie value is stored. A database dump therefore
    -- does not hand out usable sessions.
    token_hash   TEXT NOT NULL UNIQUE,
    -- Per-session CSRF token, handed to the client in the response body.
    csrf_token   TEXT NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
-- Supports the periodic sweep of expired rows.
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    category    TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 64),
    description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
    date        TIMESTAMPTZ NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for these tables are created in the Ownership section below, because
-- they all lead with user_id.

CREATE TABLE IF NOT EXISTS recurring_transactions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount        NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    category      TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 64),
    description   TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
    frequency     TEXT NOT NULL CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
    next_due_date TIMESTAMPTZ NOT NULL,
    type          TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Ownership
--
-- Added as ALTERs rather than inline columns so this migration also upgrades a
-- database created before authentication existed. The column starts nullable
-- for exactly that reason: pre-existing rows have no owner, and a NOT NULL
-- would abort the migration. Rows with a NULL owner are invisible to the API,
-- because every query filters on user_id — assign them with \`npm run claim\`.
-- ---------------------------------------------------------------------------

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE recurring_transactions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users (id) ON DELETE CASCADE;

-- Every read is "this user's rows, newest first", so user_id leads the indexes.
CREATE INDEX IF NOT EXISTS transactions_user_date_idx
    ON transactions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS transactions_user_type_date_idx
    ON transactions (user_id, type, date DESC);
CREATE INDEX IF NOT EXISTS recurring_user_due_idx
    ON recurring_transactions (user_id, next_due_date);

-- The pre-authentication indexes led with date/type. No query can use them any
-- more, because every query now filters on user_id first, so they were pure
-- write-time cost.
DROP INDEX IF EXISTS transactions_date_idx;
DROP INDEX IF EXISTS transactions_type_date_idx;
DROP INDEX IF EXISTS recurring_next_due_idx;

-- Tighten to NOT NULL as soon as nothing is unowned, so a future bug that omits
-- user_id fails loudly at the database instead of creating an orphan row.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM transactions WHERE user_id IS NULL) THEN
        ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE user_id IS NULL) THEN
        ALTER TABLE recurring_transactions ALTER COLUMN user_id SET NOT NULL;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS transactions_set_updated_at ON transactions;
CREATE TRIGGER transactions_set_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS recurring_set_updated_at ON recurring_transactions;
CREATE TRIGGER recurring_set_updated_at
    BEFORE UPDATE ON recurring_transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`;
