import type {Request} from 'express';
import jwt from 'jsonwebtoken';
import {JWTOptions} from '../webTokenStuff.js';
import NeDbWrapper from '../NeDbWrapper.js';

export interface AuthResult {
    userid: string;
    socketID?: string;
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
        const payload = jwt.verify(token, JWTOptions.secret) as any;
        const user = await dataManager.getUserByID(payload.id);
        if (!user) {
            return null;
        }
        return {
            userid: payload.id,
            socketID: req.headers['x-socket-id'] as string | undefined,
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
        };
    }

    return null;
}