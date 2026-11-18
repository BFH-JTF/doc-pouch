import type {Request} from 'express';
import jwt from 'jsonwebtoken';
import {JWTOptions} from '../webTokenStuff.js';
import NeDbWrapper from '../NeDbWrapper.js';

/**
 * #140: metadata about the credential that authenticated a request, so
 * resource servers can tell which client an OIDC access token was issued for
 * (token substitution defense).
 */
export type AuthTokenType = 'jwt' | 'oidc' | 'apiKey';

export interface AuthMetadata {
    type: AuthTokenType;
    /** Only for OIDC access tokens: the client the token was issued to. */
    clientId?: string;
    /** Only for OIDC access tokens: the scopes granted to the token. */
    scope?: string;
}

export interface AuthResult {
    userid: string;
    socketID?: string;
    auth?: AuthMetadata;
}

export async function authenticateRequest(
    req: Request,
    dataManager: NeDbWrapper,
    oidcProvider: any,
): Promise<AuthResult | null> {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return null;
    }

    const token = (authHeader as string).split(' ')[1];
    if (!token) {
        return null;
    }

    try {
        // #119: the accepted algorithm and issuer are pinned to what the
        // server actually signs with, instead of trusting whatever the
        // token header claims.
        const payload = jwt.verify(token, JWTOptions.secret, {
            algorithms: [JWTOptions.settings.algorithm],
            issuer: JWTOptions.settings.issuer,
        } as jwt.VerifyOptions) as any;
        const user = await dataManager.getUserByID(payload.id);
        if (!user) {
            return null;
        }
        return {
            userid: payload.id,
            socketID: req.headers['x-socket-id'] as string | undefined,
            auth: {type: 'jwt'},
        };
    } catch {
        // JWT verification failed, try OIDC token
    }

    try {
        const accessToken = await oidcProvider.AccessToken.find(token);
        if (accessToken && accessToken.accountId) {
            return {
                userid: accessToken.accountId,
                socketID: req.headers['x-socket-id'] as string | undefined,
                auth: {type: 'oidc', clientId: accessToken.clientId, scope: accessToken.scope},
            };
        }
    } catch {
        // OIDC token validation failed
    }

    // Try API key
    const apiKeyResult = await dataManager.apiKeys.verifyApiKey(token);
    if (apiKeyResult) {
        return {
            userid: apiKeyResult.userId,
            socketID: req.headers['x-socket-id'] as string | undefined,
            auth: {type: 'apiKey'},
        };
    }

    return null;
}