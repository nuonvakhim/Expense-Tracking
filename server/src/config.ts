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

export const config = {
    databaseUrl: required('DATABASE_URL'),
    databaseSsl: process.env.DATABASE_SSL === 'true',
    port: Number(process.env.PORT ?? 4000),
    corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
};

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
