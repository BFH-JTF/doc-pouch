import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import NeDbWrapper from '../../NeDbWrapper.js';
import SchemaValidator from '../../SchemaValidator.js';
import type winston from 'winston';
import {
    WhoamiSchema,
    ListUsersSchema,
    GetUserSchema,
    CreateUserSchema,
    UpdateUserSchema,
    DeleteUserSchema,
} from '../schemas.js';
import {mcpAuthContext} from '../context.js';
import {getErrorMessage} from '../utils.js';

function getUserId(): string | null {
    const store = mcpAuthContext.getStore();
    return store?.userid ?? null;
}

export function registerUserTools(
    server: McpServer,
    dataManager: NeDbWrapper,
    logger: winston.Logger,
    validator: SchemaValidator,
): void {
    server.registerTool('whoami', {
        description: 'Return the authenticated docPouch user\'s profile information.',
        inputSchema: WhoamiSchema,
    }, async () => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const user = await dataManager.getUserByID(userid);
            const {password: _, ...safe} = user as any;
            return {content: [{type: 'text', text: JSON.stringify(safe)}]};
        } catch (error: unknown) {
            logger.error(`MCP whoami error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('list_users', {
        description: 'List all docPouch users. Admin only; non-admin users receive only their own profile.',
        inputSchema: ListUsersSchema,
    }, async () => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const users = await dataManager.getUsers(userid);
            const safe = users.map((u: any) => {
                const {password: _, ...rest} = u;
                return rest;
            });
            return {content: [{type: 'text', text: JSON.stringify(safe)}]};
        } catch (error: unknown) {
            logger.error(`MCP list_users error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('get_user', {
        description: 'Get a docPouch user by ID. Admin only; regular users can only view themselves.',
        inputSchema: GetUserSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const isAdmin = await dataManager.isAdmin(userid);
            if (!isAdmin && args.id !== userid) {
                return {
                    content: [{type: 'text', text: 'Error: admin access required to view other users'}],
                    isError: true
                };
            }
            const user = await dataManager.getUserByID(args.id);
            const {password: _, ...safe} = user as any;
            return {content: [{type: 'text', text: JSON.stringify(safe)}]};
        } catch (error: unknown) {
            logger.error(`MCP get_user error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: User not found`}], isError: true};
        }
    });

    server.registerTool('create_user', {
        description: 'Create a new docPouch user. Admin only.',
        inputSchema: CreateUserSchema,
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
            const inputObj = {
                name: args.name,
                password: args.password,
                email: args.email,
                department: args.department,
                group: args.group,
                isAdmin: args.isAdmin,
            };
            const validated = validator.getValidatedObject('userCreation', inputObj);
            if (!validated) {
                return {content: [{type: 'text', text: 'Error: validation failed'}], isError: true};
            }
            const newUser = await dataManager.createUser(validated as any);
            const {password: _, ...safe} = newUser as any;
            return {content: [{type: 'text', text: JSON.stringify(safe)}]};
        } catch (error: unknown) {
            logger.error(`MCP create_user error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('update_user', {
        description: 'Update a docPouch user. Non-admins can update their own profile (but not the isAdmin field). Admins can update any user.',
        inputSchema: UpdateUserSchema,
    }, async (args) => {
        const userid = getUserId();
        if (!userid) {
            return {content: [{type: 'text', text: 'Error: not authenticated'}], isError: true};
        }
        try {
            const isAdmin = await dataManager.isAdmin(userid);
            if (!isAdmin && args.id !== userid) {
                return {content: [{type: 'text', text: 'Error: can only update your own profile'}], isError: true};
            }
            if (!isAdmin && args.isAdmin !== undefined) {
                return {
                    content: [{type: 'text', text: 'Error: admin access required to change isAdmin'}],
                    isError: true
                };
            }
            const inputObj: Record<string, unknown> = {};
            if (args.name !== undefined) inputObj.name = args.name;
            if (args.password !== undefined) inputObj.password = args.password;
            if (args.email !== undefined) inputObj.email = args.email;
            if (args.department !== undefined) inputObj.department = args.department;
            if (args.group !== undefined) inputObj.group = args.group;
            if (args.isAdmin !== undefined) inputObj.isAdmin = args.isAdmin;

            const validated = validator.getValidatedObject('userUpdate', inputObj);
            if (!validated) {
                return {content: [{type: 'text', text: 'Error: validation failed'}], isError: true};
            }
            const result = await dataManager.updateUser(args.id, validated as any);
            return {content: [{type: 'text', text: JSON.stringify({updated: result})}]};
        } catch (error: unknown) {
            logger.error(`MCP update_user error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });

    server.registerTool('delete_user', {
        description: 'Delete a docPouch user by ID. Admin only.',
        inputSchema: DeleteUserSchema,
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
            await dataManager.removeUser(args.id);
            return {content: [{type: 'text', text: JSON.stringify({deleted: true})}]};
        } catch (error: unknown) {
            logger.error(`MCP delete_user error: ${getErrorMessage(error)}`);
            return {content: [{type: 'text', text: `Error: ${getErrorMessage(error)}`}], isError: true};
        }
    });
}