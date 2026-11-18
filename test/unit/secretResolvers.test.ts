import {resolveJwtSecret} from '../../src/srv/webTokenStuff.js';
import {resolveOidcCookieKey, resolveOidcCookieSecure, warnIfSecureCookieProxyConflict} from '../../src/srv/NetworkManager.js';
import {jest} from '@jest/globals';
import type winston from 'winston';

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

// Regression tests for #139: the Secure flag resolves from OIDC_COOKIE_SECURE
// (explicit true/false) or falls back to NODE_ENV=production, and a forced
// Secure flag combined with the default TRUST_PROXY resolution is reported at
// startup instead of surfacing later as a misleading cookie error.
describe('resolveOidcCookieSecure', () => {
    test('explicit true forces secure cookies', () => {
        expect(resolveOidcCookieSecure({OIDC_COOKIE_SECURE: 'true'} as NodeJS.ProcessEnv)).toBe(true);
    });

    test('explicit false opts out even in production', () => {
        expect(resolveOidcCookieSecure({OIDC_COOKIE_SECURE: 'false', NODE_ENV: 'production'} as NodeJS.ProcessEnv)).toBe(false);
    });

    test('blank values fall back to the NODE_ENV default', () => {
        expect(resolveOidcCookieSecure({OIDC_COOKIE_SECURE: '  ', NODE_ENV: 'production'} as NodeJS.ProcessEnv)).toBe(true);
        expect(resolveOidcCookieSecure({OIDC_COOKIE_SECURE: '\t'} as NodeJS.ProcessEnv)).toBe(false);
    });

    test('unset follows NODE_ENV=production', () => {
        expect(resolveOidcCookieSecure({NODE_ENV: 'production'} as NodeJS.ProcessEnv)).toBe(true);
        expect(resolveOidcCookieSecure({NODE_ENV: 'development'} as NodeJS.ProcessEnv)).toBe(false);
        expect(resolveOidcCookieSecure({} as NodeJS.ProcessEnv)).toBe(false);
    });
});

describe('warnIfSecureCookieProxyConflict', () => {
    interface FakeLogger {
        logger: winston.Logger,
        errorSpy: jest.Mock
    }

    function fakeLogger(): FakeLogger {
        const errorSpy = jest.fn();
        const logger = {error: errorSpy, warn: jest.fn(), info: jest.fn(), debug: jest.fn()} as unknown as winston.Logger;
        return {logger, errorSpy};
    }

    test('production with the default TRUST_PROXY resolution warns with an actionable message', () => {
        const {logger, errorSpy} = fakeLogger();
        warnIfSecureCookieProxyConflict(logger, {NODE_ENV: 'production'} as NodeJS.ProcessEnv);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(String(errorSpy.mock.calls[0][0])).toMatch(/TRUST_PROXY/);
        expect(String(errorSpy.mock.calls[0][0])).toContain('Cannot send secure cookie over unencrypted connection');
    });

    test('explicit loopback/false trust triggers the warning as well', () => {
        const {logger, errorSpy} = fakeLogger();
        warnIfSecureCookieProxyConflict(logger, {NODE_ENV: 'production', TRUST_PROXY: 'false'} as NodeJS.ProcessEnv);
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    test('a configured trusted proxy does not warn', () => {
        const {logger, errorSpy} = fakeLogger();
        warnIfSecureCookieProxyConflict(logger, {NODE_ENV: 'production', TRUST_PROXY: 'uniquelocal'} as NodeJS.ProcessEnv);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('explicit OIDC_COOKIE_SECURE=false never warns', () => {
        const {logger, errorSpy} = fakeLogger();
        warnIfSecureCookieProxyConflict(logger, {NODE_ENV: 'production', OIDC_COOKIE_SECURE: 'false'} as NodeJS.ProcessEnv);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('outside production there is no conflict by default', () => {
        const {logger, errorSpy} = fakeLogger();
        warnIfSecureCookieProxyConflict(logger, {} as NodeJS.ProcessEnv);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    test('an explicit secure flag outside production warns on the default trust', () => {
        const {logger, errorSpy} = fakeLogger();
        warnIfSecureCookieProxyConflict(logger, {OIDC_COOKIE_SECURE: 'true'} as NodeJS.ProcessEnv);
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    test('invalid TRUST_PROXY values do not throw and do not warn', () => {
        const {logger, errorSpy} = fakeLogger();
        expect(() => warnIfSecureCookieProxyConflict(
            logger,
            {NODE_ENV: 'production', TRUST_PROXY: 'banana'} as unknown as NodeJS.ProcessEnv
        )).not.toThrow();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});