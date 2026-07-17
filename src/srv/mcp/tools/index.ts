import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import NeDbWrapper from '../../NeDbWrapper.js';
import SchemaValidator from '../../SchemaValidator.js';
import type winston from 'winston';
import EmailService from '../../EmailService.js';
import {registerDocumentTools} from './documents.js';
import {registerStructureTools} from './structures.js';
import {registerUserTools} from './users.js';
import {registerDatabaseTools} from './database.js';
import {registerSystemTools} from './system.js';

export function registerAllTools(
    server: McpServer,
    dataManager: NeDbWrapper,
    logger: winston.Logger,
    validator: SchemaValidator,
    emailService: EmailService,
): void {
    registerDocumentTools(server, dataManager, logger, validator);
    registerStructureTools(server, dataManager, logger, validator);
    registerUserTools(server, dataManager, logger, validator, emailService);
    registerDatabaseTools(server, dataManager, logger);
    registerSystemTools(server, logger);
}