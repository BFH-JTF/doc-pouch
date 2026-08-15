import rateLimit from 'express-rate-limit';
import {parseDurationToSeconds} from './webTokenStuff.js';

const skipInTest = () => process.env.NODE_ENV === 'test';

/**
 * Parse a duration string (e.g. "15m", "1h", "30s") into milliseconds.
 * Falls back to the provided default (in ms) for unrecognized formats.
 */
function parseDurationToMs(duration: string, fallbackMs: number): number {
    const seconds = parseDurationToSeconds(duration);
    return seconds === 86400 ? fallbackMs : seconds * 1000;
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
    skip: skipInTest,
});

export const writeRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(30),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many write requests, please try again later.',
    skip: skipInTest,
});

export const authRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(5),
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many authentication attempts, please try again later.',
    skip: skipInTest,
});

export const forgotPasswordRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(5),
    standardHeaders: true,
    legacyHeaders: false,
    message: {error: "Too many password reset requests. Please try again later."},
    skip: skipInTest,
});

export const resetPasswordRateLimiter = rateLimit({
    windowMs: resolveWindowMs('15m', 15 * 60 * 1000),
    max: resolveMax(10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {error: "Too many password reset attempts. Please try again later."},
    skip: skipInTest,
});