import 'dotenv/config';

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `Missing required environment variable ${name}. ` +
            `Copy server/.env.example to server/.env and fill it in.`,
        );
    }
    return value;
}

/** Strict boolean parsing — a typo like `COOKIE_SECURE=yes` must not read as false. */
function bool(name: string, fallback: boolean): boolean {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === '') return fallback;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    throw new Error(`Environment variable ${name} must be true or false, got "${raw}"`);
}

function int(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`Environment variable ${name} must be an integer in [${min}, ${max}], got "${raw}"`);
    }
    return value;
}

/**
 * Express `trust proxy`. This governs what `req.ip` is, and therefore what the
 * rate limiter keys on, so the default is deliberately "trust nothing": a
 * process that trusts X-Forwarded-For without a proxy in front lets any client
 * forge an address and get a fresh rate-limit bucket per request.
 *
 * Behind the nginx reverse proxy used in deployment, set `TRUST_PROXY=1`.
 */
function trustProxy(): boolean | number | string {
    const raw = process.env.TRUST_PROXY?.trim();
    if (raw === undefined || raw === '') return false;
    if (raw === 'false') return false;
    if (raw === 'true') return true;
    if (/^\d+$/.test(raw)) return Number(raw);
    return raw; // comma-separated address list, handled by express
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

const sameSiteRaw = (process.env.COOKIE_SAMESITE ?? 'lax').trim().toLowerCase();
if (sameSiteRaw !== 'lax' && sameSiteRaw !== 'strict' && sameSiteRaw !== 'none') {
    throw new Error(`COOKIE_SAMESITE must be lax, strict, or none, got "${sameSiteRaw}"`);
}
const cookieSameSite: 'lax' | 'strict' | 'none' = sameSiteRaw;

export const config = {
    nodeEnv,
    isProduction,
    databaseUrl: required('DATABASE_URL'),
    databaseSsl: bool('DATABASE_SSL', false),
    port: int('PORT', 4000, 1, 65_535),
    corsOrigins,
    trustProxy: trustProxy(),

    session: {
        cookieName: process.env.SESSION_COOKIE_NAME?.trim() || 'et_session',
        /** Idle-independent absolute lifetime. */
        ttlHours: int('SESSION_TTL_HOURS', 24 * 14, 1, 24 * 365),
        /** Secure cookies are mandatory over HTTPS and impossible over plain-HTTP localhost. */
        cookieSecure: bool('COOKIE_SECURE', isProduction),
        cookieSameSite,
        /**
         * Leave unset for a host-only cookie, which is the tighter default. Only
         * needed if the cookie must be shared across sibling subdomains.
         */
        cookieDomain: process.env.COOKIE_DOMAIN?.trim() || undefined,
    },

    /** Lets a deployment close registration once its accounts exist. */
    allowRegistration: bool('ALLOW_REGISTRATION', true),

    rateLimit: {
        windowMinutes: int('RATE_LIMIT_WINDOW_MINUTES', 15, 1, 1440),
        /** Per IP, across all /api routes. */
        apiMax: int('RATE_LIMIT_API_MAX', 600, 10, 100_000),
        /** Per IP, on login/register — low enough to make online guessing useless. */
        authMax: int('RATE_LIMIT_AUTH_MAX', 10, 1, 1000),
        /** Per email address, so one account cannot be attacked from many IPs. */
        authPerAccountMax: int('RATE_LIMIT_AUTH_ACCOUNT_MAX', 10, 1, 1000),
    },
} as const;

/**
 * Configuration mistakes here are silent security holes rather than crashes, so
 * they are checked once at startup and either refused or shouted about.
 */
function validateConfig(): void {
    // Cookies are sent with `credentials: 'include'`, and the CORS spec forbids
    // pairing that with a wildcard origin. Browsers would reject every response.
    if (corsOrigins.includes('*')) {
        throw new Error(
            'CORS_ORIGINS cannot be "*" because the API sends credentials. ' +
            'List the exact frontend origins instead.',
        );
    }

    if (corsOrigins.length === 0) {
        throw new Error('CORS_ORIGINS resolved to an empty list; no browser origin would be allowed.');
    }

    for (const origin of corsOrigins) {
        let parsed: URL;
        try {
            parsed = new URL(origin);
        } catch {
            throw new Error(`CORS_ORIGINS entry "${origin}" is not a valid origin (expected e.g. https://app.example.com)`);
        }
        if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
            throw new Error(`CORS_ORIGINS entry "${origin}" must be scheme + host + optional port, with no path`);
        }
    }

    // SameSite=None without Secure is rejected outright by every current browser.
    if (config.session.cookieSameSite === 'none' && !config.session.cookieSecure) {
        throw new Error('COOKIE_SAMESITE=none requires COOKIE_SECURE=true; browsers drop such cookies.');
    }

    if (isProduction) {
        if (!config.session.cookieSecure) {
            console.warn(
                '[config] WARNING: COOKIE_SECURE=false in production — the session cookie ' +
                'will travel over plain HTTP and can be captured in transit.',
            );
        }
        const insecure = corsOrigins.filter((o) => o.startsWith('http://'));
        if (insecure.length > 0) {
            console.warn(`[config] WARNING: plain-HTTP CORS origin(s) allowed in production: ${insecure.join(', ')}`);
        }
    }
}

validateConfig();

/**
 * Strips credentials from a connection string so it is safe to log.
 * postgres://user:secret@host:5432/db  ->  postgres://***@host:5432/db
 */
export function maskConnectionString(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.username || parsed.password) {
            parsed.username = '***';
            parsed.password = '';
        }
        return parsed.toString();
    } catch {
        return '<unparseable connection string>';
    }
}
