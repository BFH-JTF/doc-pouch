import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import NeDbWrapper from '../../NeDbWrapper.js';
import SchemaValidator from '../../SchemaValidator.js';
import type winston from 'winston';
import {
    ListStructuresSchema,
    GetStructureSchema,
    CreateStructureSchema,
    UpdateStructureSchema,
    DeleteStructureSchema,
    ListAnonymousStructuresSchema,
    SetAnonymousStructureSchema,
    RemoveAnonymousStructureSchema,
} from '../schemas.js';
import {mcpAuthContext} from '../context.js';
import {getErrorMessage} from '../utils.js';

function getUserId(): string | null {
    const store = mcpAuthContext.getStore();
    return store?.userid ?? null;
}

export function registerStructureTools(
    server: McpServer,
    dataManager: NeDbWrapper,
    logger: winston.Logger,
    validator: SchemaValidator,
): void {
    server.registerTool('list_structures', {
        description: 'List all docPouch document structures. Available to any authenticated user.',
        inputSchema: ListStructuresSchema,
    }, async () => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const structures = await dataManager.getStructures();
            return {content: [{type: 'text', text: JSON.stringify(structures)}]};
        } catch (error: unknown) {
            logger.error(`MCP list_structures error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('get_structure', {
        description: 'Get a single docPouch document structure by ID. Available to any authenticated user.',
        inputSchema: GetStructureSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const structures = await dataManager.getStructures();
            const structure = structures.find((s: any) => s._id === args.id);
            if (!structure) {
                return {content: [{type: 'text', text: 'Error: Structure not found'}], isError: true};
            }
            return {content: [{type: 'text', text: JSON.stringify(structure)}]};
        } catch (error: unknown) {
            logger.error(`MCP get_structure error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: Structure not found`}], isError: true};
        }
    });

    server.registerTool('create_structure', {
        description: 'Create a new docPouch document structure. Admin only.',
        inputSchema: CreateStructureSchema,
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
            const inputObj: Record<string, unknown> = {
                name: args.name,
                fields: args.fields,
            };
            if (args.description !== undefined) inputObj.description = args.description;
            if (args.type !== undefined) inputObj.type = args.type;
            if (args.subType !== undefined) inputObj.subType = args.subType;

            const validated = validator.getValidatedObject('structureCreation', inputObj);
            if (!validated) {
                return {content: [{type: 'text', text: 'Error: validation failed'}], isError: true};
            }
            const structure = await dataManager.createStructure(validated as any, userid);
            return {content: [{type: 'text', text: JSON.stringify(structure)}]};
        } catch (error: unknown) {
            logger.error(`MCP create_structure error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('update_structure', {
        description: 'Update an existing docPouch document structure. Admin only.',
        inputSchema: UpdateStructureSchema,
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
            const inputObj: Record<string, unknown> = {};
            if (args.name !== undefined) inputObj.name = args.name;
            if (args.description !== undefined) inputObj.description = args.description;
            if (args.type !== undefined) inputObj.type = args.type;
            if (args.subType !== undefined) inputObj.subType = args.subType;
            if (args.fields !== undefined) inputObj.fields = args.fields;

            const validated = validator.getValidatedObject('structureUpdate', inputObj);
            if (!validated) {
                return {content: [{type: 'text', text: 'Error: validation failed'}], isError: true};
            }

            const currentStructures = await dataManager.getStructures();
            const existing = currentStructures.find((s: any) => s._id === args.id);
            if (!existing) {
                return {content: [{type: 'text', text: 'Error: Structure not found'}], isError: true};
            }

            const updatedData = {...existing, ...validated};
            const result = await dataManager.updateStructure(args.id, updatedData as any, userid);
            if (result === 401) {
                return {content: [{type: 'text', text: 'Error: admin access required'}], isError: true};
            }
            return {content: [{type: 'text', text: JSON.stringify({updated: result})}]};
        } catch (error: unknown) {
            logger.error(`MCP update_structure error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('delete_structure', {
        description: 'Delete a docPouch document structure by ID. Admin only.',
        inputSchema: DeleteStructureSchema,
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
            const result = await dataManager.removeStructure(args.id, userid);
            if (result === 404) {
                return {content: [{type: 'text', text: 'Error: Structure not found'}], isError: true};
            }
            return {content: [{type: 'text', text: JSON.stringify({deleted: result})}]};
        } catch (error: unknown) {
            logger.error(`MCP delete_structure error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('list_anonymous_structures', {
        description: 'List all structure type/subType pairs that allow anonymous document creation. Available to any authenticated user.',
        inputSchema: ListAnonymousStructuresSchema,
    }, async () => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const entries = await dataManager.getAnonymousAllowedStructures();
            return {content: [{type: 'text', text: JSON.stringify(entries)}]};
        } catch (error: unknown) {
            logger.error(`MCP list_anonymous_structures error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('set_anonymous_structure', {
        description: 'Allow anonymous document creation for a specific structure type/subType pair. Admin only. When anonymous documents are enabled globally, only structures in this allowlist will accept anonymous submissions.',
        inputSchema: SetAnonymousStructureSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const entry = await dataManager.setAnonymousAllowed(args.type, args.subType, userid);
            return {content: [{type: 'text', text: JSON.stringify(entry)}]};
        } catch (error: unknown) {
            logger.error(`MCP set_anonymous_structure error: ${getErrorMessage(error)}`);
            const msg = getErrorMessage(error);
            if (msg === 'Only admins can manage anonymous structure allowlist') {
                return {content: [{type: 'text', text: 'Error: admin access required'}], isError: true};
            }
            return {content: [{type: 'text', text: `Error: ${msg}`}], isError: true};
        }
    });

    server.registerTool('remove_anonymous_structure', {
        description: 'Remove a structure type/subType pair from the anonymous document creation allowlist. Admin only. After removal, anonymous documents can no longer be created for this structure.',
        inputSchema: RemoveAnonymousStructureSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const result = await dataManager.removeAnonymousAllowed(args.type, args.subType, userid);
            return {content: [{type: 'text', text: JSON.stringify({removed: result})}]};
        } catch (error: unknown) {
            logger.error(`MCP remove_anonymous_structure error: ${getErrorMessage(error)}`);
            const msg = getErrorMessage(error);
            if (msg === 'Only admins can manage anonymous structure allowlist') {
                return {content: [{type: 'text', text: 'Error: admin access required'}], isError: true};
            }
            return {content: [{type: 'text', text: `Error: ${msg}`}], isError: true};
        }
    });
}