import crypto from "crypto";

/**
 * Resolves the JWT signing secret (#108).
 *
 * - When `JWT_SECRET` is configured (after trimming), it is used.
 * - When it is missing and `NODE_ENV=production`, startup fails closed:
 *   a publicly known constant must never sign production session tokens.
 * - Otherwise (development/test without configuration) a random
 *   per-process secret is generated. This keeps even unconfigured
 *   development instances unforgeable, at the cost of invalidating
 *   tokens across restarts.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
    const configured = env.JWT_SECRET?.trim();
    if (configured && configured.length > 0) {
        return configured;
    }
    if (env.NODE_ENV === "production") {
        throw new Error(
            "JWT_SECRET must be set to a strong random value when NODE_ENV=production. Generate one with: openssl rand -base64 48"
        );
    }
    console.warn(
        "[docpouch] JWT_SECRET is not set; using a random per-process secret. Session tokens will not survive restarts. Set JWT_SECRET in production."
    );
    return crypto.randomBytes(48).toString("base64");
}

const JWT_SECRET = resolveJwtSecret();

const SESSION_TIMEOUT = process.env.SESSION_TIMEOUT || "24h";

export const JWTOptions = {
    secret: JWT_SECRET,
    settings: {
        algorithm: "HS512",
        expiresIn: SESSION_TIMEOUT,
        issuer: "DocPouch"
    }
};

/**
 * Parse a duration string (e.g. "24h", "8h", "30m", "7d") into seconds.
 * Supports: s (seconds), m (minutes), h (hours), d (days).
 * Returns 86400 (24h) for unrecognized formats.
 */
export function parseDurationToSeconds(duration: string): number {
    const match = duration.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/);
    if (!match) return 86400;
    const value = parseFloat(match[1]);
    const unit = match[2];
    switch (unit) {
        case 's':
            return Math.round(value);
        case 'm':
            return Math.round(value * 60);
        case 'h':
            return Math.round(value * 3600);
        case 'd':
            return Math.round(value * 86400);
        default:
            return 86400;
    }
}