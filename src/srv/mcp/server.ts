import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import NeDbWrapper from '../NeDbWrapper.js';
import type winston from 'winston';
import SchemaValidator from '../SchemaValidator.js';
import EmailService from '../EmailService.js';
import {registerAllTools} from './tools/index.js';
import {registerResources} from './resources.js';

export function buildMcpServer(
    dataManager: NeDbWrapper,
    logger: winston.Logger,
    validator: SchemaValidator,
    emailService: EmailService,
): McpServer {
    const server = new McpServer({
        name: 'docpouch-mcp',
        version: '1.0.0',
    }, {
        instructions: 'DocPouch MCP server. Provides tools and resources to read, query, create, update, and delete documents, document structures, and users in a DocPouch instance. Authentication uses the same JWT, OIDC, or API key bearer token the REST API accepts (Authorization: Bearer <token>). All operations are subject to the same per-user access-control rules as the REST API.',
    });

    registerAllTools(server, dataManager, logger, validator, emailService);
    registerResources(server, dataManager, logger);

    return server;
}