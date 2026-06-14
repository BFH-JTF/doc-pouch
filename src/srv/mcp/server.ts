import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import NeDbWrapper from '../NeDbWrapper.js';
import type winston from 'winston';
import SchemaValidator from '../SchemaValidator.js';
import {registerAllTools} from './tools/index.js';
import {registerResources} from './resources.js';

export function buildMcpServer(
    dataManager: NeDbWrapper,
    logger: winston.Logger,
    validator: SchemaValidator,
): McpServer {
    const server = new McpServer({
        name: 'docpouch-mcp',
        version: '1.0.0',
    });

    registerAllTools(server, dataManager, logger, validator);
    registerResources(server, dataManager, logger);

    return server;
}