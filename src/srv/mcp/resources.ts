import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Variables} from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import NeDbWrapper from '../NeDbWrapper.js';
import type winston from 'winston';
import {mcpAuthContext} from './context.js';
import {getErrorMessage} from './utils.js';

export function registerResources(
    server: McpServer,
    dataManager: NeDbWrapper,
    logger: winston.Logger,
): void {
    server.registerResource(
        'document',
        new ResourceTemplate('docpouch://documents/{id}', {list: undefined}),
        {
            description: 'A docPouch document accessible to the authenticated user.',
        },
        async (uri: URL, variables: Variables) => {
            const id = variables['id'] as string;
            const store = mcpAuthContext.getStore();
            const userid = store?.userid;
            if (!userid) {
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify({error: 'not authenticated'}),
                    }],
                };
            }
            try {
                const docs = await dataManager.fetchDocuments({_id: id} as any, userid);
                if (!docs || docs.length === 0) {
                    return {
                        contents: [{
                            uri: uri.href,
                            mimeType: 'application/json',
                            text: JSON.stringify({error: 'not found'}),
                        }],
                    };
                }
                const doc = docs[0];
                const {password: _, ...safe} = doc as any;
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(safe),
                    }],
                };
            } catch (error: unknown) {
                logger.error(`MCP resource document error: ${getErrorMessage(error)}`);
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify({error: getErrorMessage(error)}),
                    }],
                };
            }
        },
    );

    server.registerResource(
        'structure',
        new ResourceTemplate('docpouch://structures/{id}', {list: undefined}),
        {
            description: 'A docPouch document structure.',
        },
        async (uri: URL, variables: Variables) => {
            const id = variables['id'] as string;
            try {
                const structures = await dataManager.getStructures();
                const structure = structures.find((s: any) => s._id === id);
                if (!structure) {
                    return {
                        contents: [{
                            uri: uri.href,
                            mimeType: 'application/json',
                            text: JSON.stringify({error: 'not found'}),
                        }],
                    };
                }
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(structure),
                    }],
                };
            } catch (error: unknown) {
                logger.error(`MCP resource structure error: ${getErrorMessage(error)}`);
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify({error: 'not found'}),
                    }],
                };
            }
        },
    );

    server.registerResource(
        'user',
        new ResourceTemplate('docpouch://users/{id}', {list: undefined}),
        {
            description: 'A docPouch user profile. Admin access required for other users.',
        },
        async (uri: URL, variables: Variables) => {
            const id = variables['id'] as string;
            const store = mcpAuthContext.getStore();
            const userid = store?.userid;
            if (!userid) {
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify({error: 'not authenticated'}),
                    }],
                };
            }
            try {
                const isAdmin = await dataManager.isAdmin(userid);
                if (!isAdmin && id !== userid) {
                    return {
                        contents: [{
                            uri: uri.href,
                            mimeType: 'application/json',
                            text: JSON.stringify({error: 'admin access required'}),
                        }],
                    };
                }
                const user = await dataManager.getUserByID(id);
                const {password: _, ...safe} = user as any;
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify(safe),
                    }],
                };
            } catch (error: unknown) {
                logger.error(`MCP resource user error: ${getErrorMessage(error)}`);
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify({error: 'user not found'}),
                    }],
                };
            }
        },
    );
}