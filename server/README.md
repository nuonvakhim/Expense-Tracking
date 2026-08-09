# AI-Expense API

Small Express + PostgreSQL backend that persists transactions and recurring rules.
Standalone package — its dependencies are deliberately kept out of the client
`package.json` so nothing server-side can end up in the Vite bundle.

## Setup

```bash
cd server
npm install
cp .env.example .env      # then fill in DATABASE_URL
npm run migrate           # creates tables, indexes, triggers
npm run dev               # http://localhost:4000
```

`migrate` is idempotent — every statement is `IF NOT EXISTS` / `OR REPLACE`, so
re-running it is safe and is the intended way to apply schema changes.

### Environment

| Variable       | Required | Default                 | Notes                                                  |
| -------------- | -------- | ----------------------- | ------------------------------------------------------ |
| `DATABASE_URL` | yes      | —                       | Startup fails loudly if unset                          |
| `DATABASE_SSL` | no       | `false`                 | Set `true` for Neon/Supabase/Heroku/RDS                |
| `PORT`         | no       | `4000`                  |                                                        |
| `CORS_ORIGIN`  | no       | `http://localhost:3000` | Comma-separated; 3000 matches the Vite dev server port |

Credentials are never logged in the clear — the startup banner prints the
connection string with user and password replaced by `***`.

TLS certificate verification is **on** when `DATABASE_SSL=true`. If your provider
serves a self-signed chain you will see `SELF_SIGNED_CERT_IN_CHAIN`; the correct
fix is to supply the provider's CA rather than disabling verification in
[src/db.ts](src/db.ts).

## Docker

From the **repo root** (the compose file lives there, the Dockerfile in `server/`):

```bash
docker compose up --build -d               # build + start the API on :4000
docker compose run --rm api npm run migrate:prod    # apply the schema, once
docker compose logs -f api                 # follow logs
docker compose down                        # stop
```

`server/.env` supplies the credentials at run time via `env_file`. It is listed
in `.dockerignore`, so nothing secret is ever baked into an image layer.

Two things to watch:

- **`localhost` inside a container is the container**, not your machine. A
  `DATABASE_URL` pointing at `localhost` will fail; use `host.docker.internal`
  for a database on your host, or the service name (`db`) for the compose one.
  A remote host such as the shared dev server works unchanged.
- **`PORT` must stay 4000** unless you also change the published port mapping
  and the `EXPOSE` line.

### Local Postgres instead of the shared server

```bash
docker compose --profile local-db up -d --build
```

Then set `DATABASE_URL=postgres://expense:expense@db:5432/expense-tracker` in
`server/.env` and run the migrate command above. Data persists in the `pgdata`
volume; `docker compose down -v` deletes it.

The API does not crash when the database is unreachable — it starts, and
`/api/health` reports `503` until Postgres accepts connections. So no startup
ordering is required between the two services.

## Scripts

| Script            | Does                                     |
| ----------------- | ---------------------------------------- |
| `npm run dev`     | tsx watch, reloads on change             |
| `npm run migrate` | applies the schema                       |
| `npm run build`   | `tsc` → `dist/`                          |
| `npm start`       | runs the built server (use in prod)      |
| `npm run typecheck` | type-check without emitting            |

## API

Base path `/api`. Bodies and responses are JSON; dates are ISO 8601 strings;
`amount` is a positive number with 2 decimal places.

| Method   | Path                    | Notes                                            |
| -------- | ----------------------- | ------------------------------------------------ |
| `GET`    | `/health`               | `503` when the database is unreachable           |
| `GET`    | `/transactions`         | Newest first. Query: `type` `category` `from` `to` `limit` (≤500, default 100) `offset` |
| `POST`   | `/transactions`         | `201` with the created row                       |
| `GET`    | `/transactions/:id`     |                                                  |
| `PUT`    | `/transactions/:id`     | Partial — send only the fields that change       |
| `DELETE` | `/transactions/:id`     | `204`                                            |
| `GET`    | `/recurring`            | Soonest due first                                |
| `POST`   | `/recurring`            | `201`                                            |
| `GET`    | `/recurring/:id`        |                                                  |
| `PUT`    | `/recurring/:id`        | Partial — this is how you advance `nextDueDate`  |
| `DELETE` | `/recurring/:id`        | `204`                                            |

`id` is optional on both `POST`s. Omit it and Postgres generates a UUID; supply
one to preserve an id the client already made with `crypto.randomUUID()`, which
is what a localStorage migration would need.

List responses are wrapped: `{ data: [...], total, limit, offset }` for
transactions, `{ data: [...] }` for recurring. Single-record responses are bare.

### Example

```bash
curl -X POST http://localhost:4000/api/transactions \
  -H 'Content-Type: application/json' \
  -d '{"amount":15.50,"category":"Food & Drink","description":"Lunch",
       "date":"2026-08-07T12:00:00.000Z","type":"EXPENSE"}'
```

### Status codes

`400` validation failed (with a `details` array naming each bad field) or
malformed JSON · `404` no such record or route · `409` id already exists ·
`413` body over 64 kb · `500` server-side bug, details logged not returned ·
`503` database unreachable.

## Design notes

- **Field shapes mirror the repo-root [types.ts](../types.ts)**, which stays the
  source of truth. The server re-declares them rather than importing across the
  package boundary; if you change `TransactionType`, `RecurrenceFrequency`, or
  the category lists there, update [src/validation.ts](src/validation.ts) and the
  `CHECK` constraints in [src/schema.ts](src/schema.ts) to match.
- **Columns are snake_case, JSON is camelCase.** `next_due_date` ⇄ `nextDueDate`
  is the only name that actually differs.
- **Amounts are `NUMERIC(14,2)`.** node-postgres returns NUMERIC as a string to
  protect precision; [src/db.ts](src/db.ts) registers a parser converting it back
  to `number` so responses match the client's `amount: number`.
- **All queries are parameterized.** The dynamic `WHERE`/`SET` builders only ever
  interpolate placeholder indexes, never values.
- **Every wait is bounded** — connection, statement, and query timeouts are set
  on the pool, and node-postgres does not retry a failed query on its own.
- **Constraints are enforced twice**, in zod and in `CHECK` constraints, so a
  direct `psql` write cannot introduce a row the app would choke on.
- Schema SQL lives in a `.ts` file so `dist/` is self-contained with no
  asset-copy step.

## Dependencies

All permissive, no GPL-family obligations:

| Package    | Version | License      |
| ---------- | ------- | ------------ |
| express    | 5.2.1   | MIT          |
| pg         | 8.22.0  | MIT          |
| cors       | 2.8.6   | MIT          |
| zod        | 4.4.3   | MIT          |
| dotenv     | 17.4.2  | BSD-2-Clause |
| tsx        | 4.23.10 | MIT (dev)    |
| typescript | 5.9.3   | Apache-2.0 (dev) |
