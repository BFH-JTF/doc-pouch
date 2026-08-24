import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import NeDbWrapper from '../../NeDbWrapper.js';
import SchemaValidator from '../../SchemaValidator.js';
import type winston from 'winston';
import {
    ListDocumentsSchema,
    GetDocumentSchema,
    CreateDocumentSchema,
    UpdateDocumentSchema,
    DeleteDocumentSchema,
} from '../schemas.js';
import {mcpAuthContext} from '../context.js';
import {getErrorMessage} from '../utils.js';
import type {I_DocumentQuery} from 'docpouch-client';

function getUserId(): string | null {
    const store = mcpAuthContext.getStore();
    return store?.userid ?? null;
}

function parseContent(content: unknown): unknown {
    if (typeof content === 'string') {
        try {
            return JSON.parse(content);
        } catch {
            return content;
        }
    }
    return content;
}

export function registerDocumentTools(
    server: McpServer,
    dataManager: NeDbWrapper,
    logger: winston.Logger,
    validator: SchemaValidator,
): void {
    server.registerTool('list_documents', {
        description: 'List docPouch documents accessible to the authenticated user. Supports optional filtering by _id, title, type, subType, owner, public, shareWithGroup, shareWithDepartment, and a limit (default 100, max 500). Title filtering is case-insensitive. Only documents the user has access to (owned, public, or shared via group/department) are returned.',
        inputSchema: ListDocumentsSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const query: I_DocumentQuery = {};
            if (args.query?._id !== undefined) query._id = args.query._id;
            if (args.query?.title !== undefined) query.title = args.query.title;
            if (args.query?.type !== undefined) query.type = args.query.type;
            if (args.query?.subType !== undefined) query.subType = args.query.subType;
            if (args.query?.owner !== undefined) query.owner = args.query.owner;
            if (args.query?.public !== undefined) query.public = args.query.public;
            if (args.query?.shareWithGroup !== undefined) query.shareWithGroup = args.query.shareWithGroup;
            if (args.query?.shareWithDepartment !== undefined) query.shareWithDepartment = args.query.shareWithDepartment;

            const limit = args.query?.limit ?? 100;
            const docs = await dataManager.fetchDocuments(query, userid);
            const limited = docs.slice(0, limit);
            const sanitized = limited.map(d => {
                const {password: _, ...rest} = d as any;
                return rest;
            });
            return {content: [{type: 'text', text: JSON.stringify(sanitized)}]};
        } catch (error: unknown) {
            logger.error(`MCP list_documents error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('get_document', {
        description: 'Get a single docPouch document by ID. Returns the full document if accessible to the authenticated user.',
        inputSchema: GetDocumentSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const docs = await dataManager.fetchDocuments({_id: args.id} as I_DocumentQuery, userid);
            if (!docs || docs.length === 0) {
                return {content: [{type: 'text', text: 'Document not found or not accessible'}], isError: true};
            }
            const doc = docs[0];
            const {password: _, ...rest} = doc as any;
            return {content: [{type: 'text', text: JSON.stringify(rest)}]};
        } catch (error: unknown) {
            logger.error(`MCP get_document error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('create_document', {
        description: 'Create a new docPouch document. The authenticated user becomes the owner unless anonymous=true (requires ANONYMOUS_DOCUMENTS_ENABLED).',
        inputSchema: CreateDocumentSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const validated = validator.getValidatedObject('documentCreation', {
                type: args.type,
                subType: args.subType,
                title: args.title,
                description: args.description,
                content: parseContent(args.content),
                public: args.public,
                shareWithGroup: args.shareWithGroup,
                shareWithDepartment: args.shareWithDepartment,
                anonymous: args.anonymous ?? false,
            });
            if (!validated) {
                return {content: [{type: 'text', text: 'Error: validation failed'}], isError: true};
            }
            const isAnonymous = args.anonymous === true;
            if (isAnonymous && !dataManager.anonymousDocumentsEnabled) {
                return {content: [{type: 'text', text: 'ANONYMOUS_DOCUMENTS_DISABLED'}], isError: true};
            }
            if (isAnonymous) {
                const allowed = await dataManager.isAnonymousAllowed(args.type, args.subType);
                if (!allowed) {
                    return {content: [{type: 'text', text: 'ANONYMOUS_NOT_ALLOWED_FOR_STRUCTURE'}], isError: true};
                }
            }
            const doc = await dataManager.createDocument(validated as any, userid, isAnonymous);
            const {password: _, ...rest} = doc as any;
            return {content: [{type: 'text', text: JSON.stringify(rest)}]};
        } catch (error: unknown) {
            logger.error(`MCP create_document error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('update_document', {
        description: 'Update an existing docPouch document. Owner/admin can update all fields except owner. Non-owners can only update content.',
        inputSchema: UpdateDocumentSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const updateData: Record<string, unknown> = {};
            if (args.title !== undefined) updateData.title = args.title;
            if (args.description !== undefined) updateData.description = args.description;
            if (args.content !== undefined) updateData.content = parseContent(args.content);
            if (args.public !== undefined) updateData.public = args.public;
            if (args.shareWithGroup !== undefined) updateData.shareWithGroup = args.shareWithGroup;
            if (args.shareWithDepartment !== undefined) updateData.shareWithDepartment = args.shareWithDepartment;

            const validated = validator.getValidatedObject('documentUpdate', updateData);
            if (!validated) {
                return {content: [{type: 'text', text: 'Error: validation failed'}], isError: true};
            }
            const result = await dataManager.updateDocument(args.id, validated as any, userid);
            if (result === 404) {
                return {content: [{type: 'text', text: 'Document not found'}], isError: true};
            }
            if (result === 400) {
                return {
                    content: [{type: 'text', text: 'Bad request: cannot update or no fields to update'}],
                    isError: true
                };
            }
            if (result === 401) {
                return {content: [{type: 'text', text: 'Unauthorized: not document owner'}], isError: true};
            }
            return {content: [{type: 'text', text: JSON.stringify({updated: result})}]};
        } catch (error: unknown) {
            logger.error(`MCP update_document error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('delete_document', {
        description: 'Delete a docPouch document by ID. Only the owner or an admin can delete a document.',
        inputSchema: DeleteDocumentSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const result = await dataManager.removeDocument(args.id, userid);
            if (result === 404) {
                return {content: [{type: 'text', text: 'Document not found'}], isError: true};
            }
            if (result === 401) {
                return {content: [{type: 'text', text: 'Unauthorized: not document owner or admin'}], isError: true};
            }
            return {content: [{type: 'text', text: JSON.stringify({deleted: result})}]};
        } catch (error: unknown) {
            logger.error(`MCP delete_document error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });
}