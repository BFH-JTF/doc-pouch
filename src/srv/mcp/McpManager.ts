import type express from 'express';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import NeDbWrapper from '../NeDbWrapper.js';
import type winston from 'winston';
import SchemaValidator from '../SchemaValidator.js';
import {buildMcpServer} from './server.js';
import {authenticateRequest} from './auth.js';
import {mcpAuthContext} from './context.js';

export default class McpManager {
    private readonly transport: StreamableHTTPServerTransport;
    private readonly server: ReturnType<typeof buildMcpServer>;

    constructor(
        private readonly app: express.Application,
        private readonly dataManager: NeDbWrapper,
        private readonly logger: winston.Logger,
        private readonly validator: SchemaValidator,
        private readonly oidcProvider: any,
    ) {
        this.server = buildMcpServer(this.dataManager, this.logger, this.validator);
        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        this.server.connect(this.transport).catch((err: any) => {
            this.logger.error(`MCP server connect failed: ${err}`);
        });
        this.mount();
    }

    public async close(): Promise<void> {
        await this.server.close();
    }

    private mount(): void {
        this.app.all('/mcp', async (req: express.Request, res: express.Response) => {
            try {
                const result = await authenticateRequest(req, this.dataManager, this.oidcProvider);
                if (!result) {
                    res.status(401).json({error: 'Unauthorized'});
                    return;
                }
                await mcpAuthContext.run({userid: result.userid}, async () => {
                    await this.transport.handleRequest(req, res, req.body);
                });
            } catch (err: any) {
                this.logger.error(`MCP request failed: ${err}`);
                if (!res.headersSent) {
                    res.status(500).json({error: 'MCP error'});
                }
            }
        });
    }
}