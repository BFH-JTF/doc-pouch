import rateLimit, {ipKeyGenerator} from 'express-rate-limit';
import type {Request} from 'express';
import {parseDurationToSeconds} from './webTokenStuff.js';

const USERNAME_KEY_MAX_LENGTH = 128;

export function authKeyGenerator(req: Request): string {
    const submittedName: unknown = req.body?.name;
    const clientIp = req.ip ?? 'unknown';
    if (typeof submittedName !== 'string' || submittedName.length === 0) {
        return ipKeyGenerator(clientIp);
    }
    return `${ipKeyGenerator(clientIp)}:${submittedName.slice(0, USERNAME_KEY_MAX_LENGTH)}`;
}

// #119: rate limiting can be disabled explicitly (test environments).
// Production deployments no longer lose throttling silently just because
// NODE_ENV happens to be set to 'test' — that was a misconfiguration
// hazard; the skip now requires the explicit opt-in.
const rateLimitsDisabled = () => process.env.RATE_LIMIT_DISABLED === 'true';

/**
 * Parse a duration string (e.g. "15m", "1h", "30s") into milliseconds.
 * Falls back to the provided default (in ms) for unrecognized formats.
 * Valid values the parser understands (e.g. "1d") are honored even when
 * they numerically equal the fallback (#119: previously "1d" was
 * indistinguishable from an invalid string and silently became the
 * per-limiter default).
 */
function parseDurationToMs(duration: string, fallbackMs: number): number {
    const seconds = parseDurationToSeconds(duration, -1);
    return seconds === -1 ? fallbackMs : seconds * 1000;
}

/**
 * Parse a positive integer from an env var.
 * Falls back to the provided default for missing/invalid values.
 */
function parsePositiveInt(value: string | undefined, fallback: number): number {
    const n = parseInt(value || '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

const overrideMax = process.env.RATE_LIMIT_MAX;
const overrideWindow = process.env.RATE_LIMIT_WINDOW;

function resolveMax(defaultMax: number): number {
    return overrideMax ? parsePositiveInt(overrideMax, defaultMax) : defaultMax;
}

function resolveWindowMs(defaultDuration: string, defaultMs: number): number {
    const duration = overrideWindow ?? defaultDuration;
    const fallback = overrideWindow ? defaultMs : defaultMs;
    return parseDurationToMs(duration, fallback);
}

export const apiRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
    skip: rateLimitsDisabled,
});

export const writeRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(30),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many write requests, please try again later.',
    skip: rateLimitsDisabled,
});

export const authRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(5),
    keyGenerator: authKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many authentication attempts, please try again later.',
    skip: rateLimitsDisabled,
});

export const authIpRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(30),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many authentication attempts, please try again later.',
    skip: rateLimitsDisabled,
});

export const forgotPasswordRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(5),
    standardHeaders: true,
    legacyHeaders: false,
    message: {error: "Too many password reset requests. Please try again later."},
    skip: rateLimitsDisabled,
});

export const resetPasswordRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {error: "Too many password reset attempts. Please try again later."},
    skip: rateLimitsDisabled,
});