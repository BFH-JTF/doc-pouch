const JWT_SECRET = process.env.JWT_SECRET || "ThisIsMyVeryOwnAndCreativeSecret";

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