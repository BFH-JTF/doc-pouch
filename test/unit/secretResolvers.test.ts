import {resolveJwtSecret} from '../../src/srv/webTokenStuff.js';
import {resolveOidcCookieKey} from '../../src/srv/NetworkManager.js';

// Regression tests for #108: the JWT and OIDC cookie secrets must never
// fall back to a publicly known constant. Production fails closed, and
// unconfigured development instances get a random per-process secret.

describe('resolveJwtSecret', () => {
    const originalEnv = process.env;

    afterEach(() => {
        process.env = originalEnv;
    });

    test('returns the configured secret', () => {
        const secret = resolveJwtSecret({JWT_SECRET: '  configured-secret  '} as NodeJS.ProcessEnv);
        expect(secret).toBe('configured-secret');
    });

    test('fails closed in production when the secret is missing', () => {
        expect(() => resolveJwtSecret({NODE_ENV: 'production'} as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
    });

    test('fails closed in production when the secret is blank', () => {
        expect(() => resolveJwtSecret({NODE_ENV: 'production', JWT_SECRET: '   '} as NodeJS.ProcessEnv)).toThrow(/JWT_SECRET/);
    });

    test('falls back to a random per-process secret outside production', () => {
        const a = resolveJwtSecret({} as NodeJS.ProcessEnv);
        const b = resolveJwtSecret({} as NodeJS.ProcessEnv);
        expect(a).not.toBe(b);
        expect(a.length).toBeGreaterThanOrEqual(32);
        expect(a).not.toContain('ThisIsMyVeryOwnAndCreativeSecret');
    });
});

describe('resolveOidcCookieKey', () => {
    test('returns the configured key', () => {
        const key = resolveOidcCookieKey({OIDC_COOKIE_KEY: '  configured-cookie-key  '} as NodeJS.ProcessEnv);
        expect(key).toBe('configured-cookie-key');
    });

    test('fails closed in production when the key is missing', () => {
        expect(() => resolveOidcCookieKey({NODE_ENV: 'production'} as NodeJS.ProcessEnv)).toThrow(/OIDC_COOKIE_KEY/);
    });

    test('fails closed in production when the key is blank', () => {
        expect(() => resolveOidcCookieKey({NODE_ENV: 'production', OIDC_COOKIE_KEY: '\t'} as NodeJS.ProcessEnv)).toThrow(/OIDC_COOKIE_KEY/);
    });

    test('falls back to a random per-process key outside production', () => {
        const a = resolveOidcCookieKey({} as NodeJS.ProcessEnv);
        const b = resolveOidcCookieKey({} as NodeJS.ProcessEnv);
        expect(a).not.toBe(b);
        expect(a.length).toBeGreaterThanOrEqual(32);
        expect(a).not.toContain('docpouch-cookie-secret-change-in-production');
    });
});