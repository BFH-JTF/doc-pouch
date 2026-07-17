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
        new ResourceTemplate('docpouch://documents/{id}', {
            list: async () => {
                const store = mcpAuthContext.getStore();
                const userid = store?.userid;
                if (!userid) {
                    return {resources: []};
                }
                try {
                    const docs = await dataManager.getAllDocuments(userid);
                    return {
                        resources: docs.map((doc: any) => ({
                            uri: `docpouch://documents/${doc._id}`,
                            name: doc.title || doc._id,
                            description: `Document: ${doc.title || doc._id} (type: ${doc.type}/${doc.subType}, owner: ${doc.owner})`,
                            mimeType: 'application/json',
                        })),
                    };
                } catch (error: unknown) {
                    logger.error(`MCP resource document list error: ${getErrorMessage(error)}`);
                    return {resources: []};
                }
            },
        }),
        {
            description: 'A single docPouch document accessible to the authenticated user. Use the URI template docpouch://documents/{id} to read a specific document by its ID. Listing this resource template returns all documents the user can access.',
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
        new ResourceTemplate('docpouch://structures/{id}', {
            list: async () => {
                try {
                    const structures = await dataManager.getStructures();
                    return {
                        resources: structures.map((s: any) => ({
                            uri: `docpouch://structures/${s._id}`,
                            name: s.name || s._id,
                            description: `Document structure: ${s.name || s._id} (type: ${s.type}/${s.subType}, ${s.fields?.length || 0} fields)`,
                            mimeType: 'application/json',
                        })),
                    };
                } catch (error: unknown) {
                    logger.error(`MCP resource structure list error: ${getErrorMessage(error)}`);
                    return {resources: []};
                }
            },
        }),
        {
            description: 'A docPouch document structure (schema/template) that defines the expected fields and their types for a category of documents. Use the URI template docpouch://structures/{id} to read a specific structure by its ID. Listing this resource template returns all structures in the system.',
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
        new ResourceTemplate('docpouch://users/{id}', {
            list: async () => {
                const store = mcpAuthContext.getStore();
                const userid = store?.userid;
                if (!userid) {
                    return {resources: []};
                }
                try {
                    const users = await dataManager.getUsers(userid);
                    return {
                        resources: users.map((u: any) => ({
                            uri: `docpouch://users/${u._id}`,
                            name: u.name || u._id,
                            description: `User profile: ${u.name || u._id} (department: ${u.department}, group: ${u.group}, admin: ${u.isAdmin})`,
                            mimeType: 'application/json',
                        })),
                    };
                } catch (error: unknown) {
                    logger.error(`MCP resource user list error: ${getErrorMessage(error)}`);
                    return {resources: []};
                }
            },
        }),
        {
            description: 'A docPouch user profile. Use the URI template docpouch://users/{id} to read a specific user by their ID. Admin users can access any user profile; non-admin users can only access their own. Listing this resource template returns all users the authenticated user is allowed to see (all for admins, only self for non-admins).',
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