# AI-Expense API

Small Express + PostgreSQL backend that persists transactions and recurring rules.
Standalone package — its dependencies are deliberately kept out of the client
`package.json` so nothing server-side can end up in the Vite bundle.

Every record belongs to an account, and every endpoint except `/api/health`
requires a signed-in session. See [Security](#security) for the model.

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

Then create the first account from the app's sign-up screen; there is no seeded
user and no default password.

### Upgrading a database that predates authentication

`migrate` adds `user_id` to both record tables as a **nullable** column, because
rows that already exist have no owner and a `NOT NULL` would abort the migration.
Since every query filters on `user_id`, those rows are still in the database but
invisible to the API. To hand them to an account:

```bash
# 1. register the account in the app, then:
npm run claim -- you@example.com
npm run migrate            # now tightens user_id to NOT NULL
```

This is a separate, argument-taking command on purpose: silently giving
historical financial records to whichever account registered first is not a
decision a migration should make on its own.

### Environment

| Variable                        | Required | Default                 | Notes                                                                    |
| ------------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                  | yes      | —                       | Startup fails loudly if unset                                            |
| `DATABASE_SSL`                  | no       | `false`                 | Set `true` for Neon/Supabase/Heroku/RDS                                  |
| `PORT`                          | no       | `4000`                  |                                                                          |
| `CORS_ORIGINS`                   | no       | `http://localhost:3000` | Comma-separated exact origins. **Cannot be `*`** — the API sends cookies |
| `NODE_ENV`                      | no       | `development`           | `production` turns on HSTS and defaults `COOKIE_SECURE` to true          |
| `TRUST_PROXY`                   | no       | `false`                 | Set to `1` behind the nginx reverse proxy. See the warning below          |
| `SESSION_COOKIE_NAME`           | no       | `et_session`            |                                                                          |
| `SESSION_TTL_HOURS`             | no       | `336` (14 days)         | Absolute lifetime; the session cannot outlive it                         |
| `COOKIE_SECURE`                 | no       | on in production        | `false` is required for plain-HTTP localhost, and only there              |
| `COOKIE_SAMESITE`               | no       | `lax`                   | `none` (which forces `COOKIE_SECURE=true`) only if the frontend is on a different registrable domain |
| `COOKIE_DOMAIN`                 | no       | unset (host-only)       | Leave unset unless the cookie must span sibling subdomains               |
| `ALLOW_REGISTRATION`            | no       | `true`                  | Set `false` to close sign-up once the accounts exist                     |
| `RATE_LIMIT_WINDOW_MINUTES`     | no       | `15`                    |                                                                          |
| `RATE_LIMIT_API_MAX`            | no       | `600`                   | Per IP, all `/api` routes                                                |
| `RATE_LIMIT_AUTH_MAX`           | no       | `10`                    | Per IP, credential endpoints; successful requests are not counted        |
| `RATE_LIMIT_AUTH_ACCOUNT_MAX`   | no       | `10`                    | Per email address, so many IPs cannot multiply guesses at one account    |

Bad combinations are refused at startup rather than becoming silent holes:
`CORS_ORIGINS=*`, `COOKIE_SAMESITE=none` without `COOKIE_SECURE`, an origin with a
path, a non-boolean boolean, or an out-of-range port all fail fast. Plain-HTTP
origins and non-secure cookies in production log a warning.

> **`TRUST_PROXY` matters for more than logging.** It decides whether `req.ip`
> comes from `X-Forwarded-For`, and the rate limiter keys on `req.ip`. Trusting
> the header with no proxy in front lets any client forge an address and get a
> fresh rate-limit bucket per request. Leaving it `false` behind a proxy makes
> every request look like it comes from the proxy, so one abusive client can
> exhaust the shared budget. Set it to the number of proxies actually in front.

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

| Script              | Does                                                        |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | tsx watch, reloads on change                                |
| `npm run migrate`   | applies the schema                                          |
| `npm run claim`     | `-- <email>` assigns pre-authentication rows to an account   |
| `npm run build`     | `tsc` → `dist/`                                             |
| `npm start`         | runs the built server (use in prod)                         |
| `npm run typecheck` | type-check without emitting                                 |

`migrate:prod` and `claim:prod` are the same two against `dist/`, for containers
where `tsx` is not installed.

## API

Base path `/api`. Bodies and responses are JSON; dates are ISO 8601 strings;
`amount` is a positive number with 2 decimal places.

**Everything except `/health` requires a session**, and every state-changing
request additionally requires the session's CSRF token in an `X-CSRF-Token`
header. Records are always scoped to the signed-in account.

| Method   | Path                    | Auth | Notes                                                                           |
| -------- | ----------------------- | ---- | ------------------------------------------------------------------------------- |
| `GET`    | `/health`               | no   | `503` when the database is unreachable                                          |
| `POST`   | `/auth/register`        | no   | `{email, password}` → `201` `{user, csrfToken}` + session cookie                |
| `POST`   | `/auth/login`           | no   | `{email, password}` → `200` `{user, csrfToken}` + session cookie                |
| `GET`    | `/auth/me`              | yes  | `{user, csrfToken}` — how the client restores a session on load                 |
| `POST`   | `/auth/logout`          | yes  | `204`; revokes the session server-side, not just the cookie                     |
| `POST`   | `/auth/password`        | yes  | `{currentPassword, newPassword}` → `{revokedSessions}`; signs other devices out |

| Method   | Path                    | Notes                                            |
| -------- | ----------------------- | ------------------------------------------------ |
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

Sign in first, keep the cookie, and echo the CSRF token back on the write:

```bash
# 1. log in, saving the session cookie and capturing the CSRF token
CSRF=$(curl -s -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your long password"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).csrfToken')

# 2. create a transaction
curl -X POST http://localhost:4000/api/transactions \
  -b cookies.txt \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"amount":15.50,"category":"Food & Drink","description":"Lunch",
       "date":"2026-08-07T12:00:00.000Z","type":"EXPENSE"}'

rm cookies.txt   # it holds a live session
```

### Status codes

`400` validation failed (with a `details` array naming each bad field) or
malformed JSON · `401` no session, or an expired/revoked one · `403` bad or
missing CSRF token, disallowed `Origin`, wrong current password, or registration
closed · `404` no such record or route — **including a record owned by someone
else** · `409` email already registered, or id already exists · `413` body over
64 kb · `429` rate limited · `500` server-side bug, details logged not returned ·
`503` database unreachable.

## Security

### Sessions

Opaque 256-bit random tokens stored in the `sessions` table, **not** JWTs. The
trade is deliberate: a self-contained token cannot be revoked before it expires,
and revocation is exactly what logout and "someone may have my password" need.

- The cookie is `HttpOnly`, so injected JavaScript cannot read it, plus `Secure`
  and `SameSite` per configuration, and `Path=/`.
- Only the **SHA-256 of the token** is stored. A database dump does not hand out
  usable sessions. Plain SHA-256 is right here — unlike for a password, the input
  is already 256 random bits, so there is no dictionary to attack.
- Lookup and `last_seen_at` refresh happen in one statement, and expired rows
  simply do not match, so an expired session is indistinguishable from a forged
  one. An hourly sweep deletes them to stop the table growing.
- Changing a password revokes every *other* session.

### CSRF

Synchronizer-token pattern, tied to the session row. The token is returned in the
**body** of `login`/`register`/`me` and the client holds it in memory; it is not
in a readable cookie, because the frontend and API are different origins, and a
memory-held token also cannot outlive the tab into another user's visit.

An attacker's page can make a browser attach the session cookie, but it cannot
read that token or set a custom header on a cross-site form post. As defence in
depth, any state-changing request carrying a non-allowlisted `Origin` is refused
outright — that also covers login, which has no session token yet. A request with
no `Origin` is allowed, since non-browser callers (curl, probes) send none and
nothing is attaching cookies on their behalf.

### Passwords

scrypt from Node's own `crypto`, at `N=2^16, r=8, p=1` — a ~64 MiB working set per
hash, which is what defeats GPU cracking. No dependency and no native build step,
which matters on `node:22-alpine` where bcrypt/argon2 would pull python3+make+g++
into the build.

The stored format `scrypt$N$r$p$salt$hash` is self-describing, so cost can be
raised later and old hashes both still verify and get upgraded transparently on
the owner's next successful login.

Only length is enforced — **6 characters minimum**. Composition rules shrink the
space users actually pick from and push them toward `Password1!`.

That floor is lower than the 12 characters current guidance recommends, and the
trade is worth naming: what it costs is resistance to an **offline** attack on a
stolen database dump, where 6 characters is within brute-force reach. Online
guessing is still covered by the per-account rate limit, and scrypt's 64 MiB per
attempt keeps offline cracking slow. Raising it later is a one-line change in
[src/validation.ts](src/validation.ts) (mirrored in
[AuthScreen.tsx](../src/components/AuthScreen.tsx)) — existing accounts keep
working, since `verifyPassword` reads each hash's own parameters.

### Not leaking who has an account

Login answers `401 Invalid email address or password` for both a wrong password
and an unknown address. Because a real verification costs ~100 ms and an early
return costs ~0 ms, an unknown address would still be detectable by timing — so
the unknown-address path hashes against a throwaway decoy to spend the same time.

Registration necessarily reveals a taken address via `409`; that is inherent to
letting someone know why sign-up failed.

### Ownership

`user_id` is on both record tables, and every single statement filters on it —
taken from the session, never from anything the client sent. Quoting another
account's record id returns the same `404` as an id that does not exist, on read,
update, and delete alike. All indexes lead with `user_id`.

### Rate limiting

Two ceilings on credential endpoints: per IP, and per submitted email address so
that spreading an attack across many addresses does not multiply guesses at one
account. Successful requests are not counted, so a real user is not locked out by
their own earlier typos. A broad per-IP ceiling covers all of `/api`.

`/api/health` sits ahead of the limiter so a container health probe can never be
throttled.

### Response headers

`helmet` with a deny-everything CSP (`default-src 'none'`, `frame-ancestors
'none'`) — appropriate because this API only ever returns JSON — plus `nosniff`,
`no-referrer`, HSTS in production, and `Cache-Control: no-store` on all of `/api`
so financial data and session responses never sit in a shared cache.

The frontend's own headers, including its CSP, live in
[../nginx.conf](../nginx.conf).

### What this does *not* do

Worth being explicit, so nobody assumes otherwise:

- **No email verification and no password reset.** An address is never proven to
  belong to the registrant, and a forgotten password needs an operator. Both need
  an email sender to do properly.
- **No 2FA.**
- **No audit log** of logins or record changes beyond `created_at`/`updated_at`.
- **No account lockout** — rate limiting slows guessing but never locks an
  account, which would itself be a denial-of-service lever against a known user.
- **Budget limits stay in `localStorage`**, namespaced per account id. They are
  client-side preferences, not protected data.

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
- **Password hashing needs no native module**, so the Alpine image stays free of
  a compiler toolchain. See [Security](#passwords).
- **Every wait is bounded** — connection, statement, and query timeouts are set
  on the pool, and node-postgres does not retry a failed query on its own.
- **Constraints are enforced twice**, in zod and in `CHECK` constraints, so a
  direct `psql` write cannot introduce a row the app would choke on.
- Schema SQL lives in a `.ts` file so `dist/` is self-contained with no
  asset-copy step.

## Dependencies

All permissive, no GPL-family obligations:

| Package             | Version | License      |
| ------------------- | ------- | ------------ |
| express             | 5.2.1   | MIT          |
| pg                  | 8.22.0  | MIT          |
| cors                | 2.8.6   | MIT          |
| zod                 | 4.4.3   | MIT          |
| dotenv              | 17.4.2  | BSD-2-Clause |
| helmet              | 8.3.0   | MIT          |
| express-rate-limit  | 8.6.2   | MIT          |
| cookie-parser       | 1.4.7   | MIT          |

Password hashing deliberately adds no dependency — it uses Node's built-in
`crypto.scrypt`.
| tsx        | 4.23.10 | MIT (dev)    |
| typescript | 5.9.3   | Apache-2.0 (dev) |
