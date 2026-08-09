/**
 * Schema is kept here rather than in a .sql file so that `tsc` output in dist/
 * is self-contained — no asset-copy step, no runtime path resolution.
 *
 * Every statement is idempotent, so migrate can be re-run safely.
 */
export const SCHEMA_SQL = `
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

-- The list view is always "newest first", optionally filtered by type.
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date DESC);
CREATE INDEX IF NOT EXISTS transactions_type_date_idx ON transactions (type, date DESC);

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

-- Supports "which rules are due?" scans.
CREATE INDEX IF NOT EXISTS recurring_next_due_idx ON recurring_transactions (next_due_date);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS transactions_set_updated_at ON transactions;
CREATE TRIGGER transactions_set_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS recurring_set_updated_at ON recurring_transactions;
CREATE TRIGGER recurring_set_updated_at
    BEFORE UPDATE ON recurring_transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`;
