const JWT_SECRET = process.env.JWT_SECRET || "ThisIsMyVeryOwnAndCreativeSecret";

export const JWTOptions = {
    secret: JWT_SECRET,
    settings: {
        algorithm: "HS512",
        expiresIn: "24h",
        issuer: "DocPouch"
    }
};


