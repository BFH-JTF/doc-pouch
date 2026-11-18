import * as express from 'express';
import type {AuthMetadata} from './mcp/auth.js';

declare global {
    namespace Express {
        interface Request {
            userid: string;
            socketID: string | undefined
            /**
             * #140: credential metadata resolved by the authenticate
             * middleware (NOT "auth", which is reserved by the MCP SDK's
             * AuthInfo typing).
             */
            authMeta?: AuthMetadata
        }
    }
}
