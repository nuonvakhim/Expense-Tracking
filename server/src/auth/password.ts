import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with scrypt from Node's own crypto module.
 *
 * scrypt is memory-hard, so it resists the GPU/ASIC cracking that plain SHA and
 * PBKDF2 fall to, and it needs no dependency and no native build step — which
 * matters because the runtime image is `node:22-alpine`, where bcrypt/argon2
 * would drag python3+make+g++ into the build stage.
 *
 * Stored format is self-describing:
 *     scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 * so the cost can be raised later and old hashes still verify (and can be
 * re-hashed transparently on the user's next successful login).
 */

const scryptAsync = promisify(scrypt) as (
    password: string | Buffer,
    salt: Buffer,
    keylen: number,
    options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// N=2^16, r=8 => a ~64 MiB working set per hash, roughly 100 ms on a modern core.
const N = 2 ** 16;
const R = 8;
const P = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

/** Node's default maxmem is 32 MiB, below what these parameters need. */
function maxmemFor(n: number, r: number): number {
    return 128 * n * r * 2;
}

/**
 * Upper bounds on parsed parameters. The values come from our own database, not
 * from a request, but a corrupted or tampered row must not be able to make the
 * process allocate gigabytes while a request waits on it.
 */
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

async function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
    return scryptAsync(password.normalize('NFKC'), salt, KEY_BYTES, {
        N: n,
        r,
        p,
        maxmem: maxmemFor(n, r),
    });
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const hash = await derive(password, salt, N, R, P);
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Constant-time comparison against a stored hash. Returns false — never throws —
 * for a malformed stored value, so one bad row cannot 500 the login endpoint.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [string, string, string, string, string, string];
    const n = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);

    const powerOfTwo = Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;
    if (!powerOfTwo || n > MAX_N) return false;
    if (!Number.isInteger(r) || r < 1 || r > MAX_R) return false;
    if (!Number.isInteger(p) || p < 1 || p > MAX_P) return false;

    let salt: Buffer;
    let expected: Buffer;
    try {
        salt = Buffer.from(saltRaw, 'base64');
        expected = Buffer.from(hashRaw, 'base64');
    } catch {
        return false;
    }
    if (salt.length === 0 || expected.length === 0) return false;

    let actual: Buffer;
    try {
        actual = await derive(password, salt, n, r, p);
    } catch {
        return false;
    }

    // timingSafeEqual throws on a length mismatch, which would itself leak.
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
}

/** True when a stored hash was made with weaker parameters than we now use. */
export function needsRehash(stored: string): boolean {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
    return Number(parts[1]) < N || Number(parts[2]) < R || Number(parts[3]) < P;
}

/**
 * A throwaway hash used to spend the same CPU time when the submitted email has
 * no account. Without it, "unknown email" returns in ~0 ms while "known email,
 * wrong password" takes ~100 ms, which enumerates registered users.
 */
const decoyHash: Promise<string> = hashPassword(randomBytes(32).toString('hex'));

export async function burnPasswordTime(password: string): Promise<void> {
    await verifyPassword(password, await decoyHash);
}
