import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import NeDbWrapper, {type DatabaseCollection, type ImportMode} from '../../NeDbWrapper.js';
import type winston from 'winston';
import {
    ExportDatabaseSchema,
    ImportDatabaseSchema,
} from '../schemas.js';
import {mcpAuthContext} from '../context.js';
import {getErrorMessage} from '../utils.js';

function getUserId(): string | null {
    const store = mcpAuthContext.getStore();
    return store?.userid ?? null;
}

function stripPasswords(data: any): any {
    if (Array.isArray(data)) {
        return data.map(item => {
            if (item && typeof item === 'object') {
                const {password: _, ...rest} = item;
                return rest;
            }
            return item;
        });
    }
    if (data && typeof data === 'object') {
        const {password: _, ...rest} = data;
        return rest;
    }
    return data;
}

function stripPasswordsFromExport(data: any): any {
    if (data.users) {
        data.users = data.users.map((u: any) => {
            const {password: _, ...rest} = u;
            return rest;
        });
    }
    return data;
}

function parseDatabaseScope(scope: string): DatabaseCollection | 'all' {
    const normalized = scope.trim().toLowerCase();
    if (normalized === 'all') {
        return 'all';
    }
    if (normalized === 'users' || normalized === 'documents' || normalized === 'structures') {
        return normalized;
    }
    throw new Error('Invalid scope. Allowed values: all, users, documents, structures.');
}

function parseImportMode(mode: string): ImportMode {
    const normalized = mode.trim().toLowerCase();
    if (normalized === 'replace' || normalized === 'add' || normalized === 'skip') {
        return normalized as ImportMode;
    }
    throw new Error('Invalid import mode. Allowed values: replace, add, skip.');
}

export function registerDatabaseTools(
    server: McpServer,
    dataManager: NeDbWrapper,
    logger: winston.Logger,
): void {
    server.registerTool('export_database', {
        description: 'Export docPouch database data as JSON. Admin only. Returns the full data for the selected scope (users, documents, structures, or all). Password hashes are stripped from user records. Use this for backup, migration, or data inspection. For ZIP export, use the REST API endpoint GET /database/export instead.',
        inputSchema: ExportDatabaseSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const isAdmin = await dataManager.isAdmin(userid);
            if (!isAdmin) {
                return {content: [{type: 'text', text: 'Error: admin access required'}], isError: true};
            }

            const scope = parseDatabaseScope(args.scope);

            if (scope === 'all') {
                const exportData = await dataManager.exportAllData();
                stripPasswordsFromExport(exportData);
                return {content: [{type: 'text', text: JSON.stringify(exportData)}]};
            }

            const collectionData = await dataManager.exportCollection(scope as DatabaseCollection);
            if (scope === 'users') {
                const sanitized = stripPasswords(collectionData);
                return {content: [{type: 'text', text: JSON.stringify(sanitized)}]};
            }
            return {content: [{type: 'text', text: JSON.stringify(collectionData)}]};
        } catch (error: unknown) {
            logger.error(`MCP export_database error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('import_database', {
        description: 'Import data into the docPouch database from a JSON string. Admin only. Destructive operation — use with caution, especially in "replace" mode which overwrites existing records. The data parameter must be a valid JSON string matching the scope. Importing users with password hashes is supported (hashes are preserved as-is). Cross-collection references (e.g., document.owner pointing to a user ID) are rewritten automatically in "add" mode. This tool does not support ZIP import — use the REST API endpoint POST /database/import for that.',
        inputSchema: ImportDatabaseSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const isAdmin = await dataManager.isAdmin(userid);
            if (!isAdmin) {
                return {content: [{type: 'text', text: 'Error: admin access required'}], isError: true};
            }

            const scope = parseDatabaseScope(args.scope);
            const mode = parseImportMode(args.mode);

            let parsed: any;
            try {
                parsed = JSON.parse(args.data);
            } catch {
                return {content: [{type: 'text', text: 'Error: invalid JSON in data parameter'}], isError: true};
            }

            let importData: any;

            if (scope === 'all') {
                if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                    return {
                        content: [{
                            type: 'text',
                            text: 'Error: invalid JSON payload for scope "all". Expected an object with one or more collection keys (users, documents, structures).'
                        }], isError: true
                    };
                }
                importData = parsed;
            } else {
                if (Array.isArray(parsed)) {
                    importData = {[scope]: parsed};
                } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as Record<string, unknown>)[scope])) {
                    importData = {[scope]: (parsed as Record<string, unknown>)[scope]};
                } else {
                    return {
                        content: [{
                            type: 'text',
                            text: `Error: invalid JSON payload for scope "${scope}". Expected an array or an object containing a "${scope}" key with an array.`
                        }], isError: true
                    };
                }
            }

            const result = await dataManager.importCollections(importData, mode);

            const summary = {
                users: {
                    created: result.users.created.length,
                    updated: result.users.updated.length,
                },
                documents: {
                    created: result.documents.created.length,
                    updated: result.documents.updated.length,
                },
                structures: {
                    created: result.structures.created.length,
                    updated: result.structures.updated.length,
                },
                mode,
                scope,
                message: 'Database import completed successfully.',
            };

            return {content: [{type: 'text', text: JSON.stringify(summary)}]};
        } catch (error: unknown) {
            logger.error(`MCP import_database error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });
}