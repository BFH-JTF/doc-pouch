import type express from 'express';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ClientRequest, ServerResponse} from 'http';
import NeDbWrapper from '../NeDbWrapper.js';
import type winston from 'winston';
import SchemaValidator from '../SchemaValidator.js';
import {buildMcpServer} from './server.js';
import {authenticateRequest} from './auth.js';
import {mcpAuthContext} from './context.js';

export default class McpManager {
    private readonly server: ReturnType<typeof buildMcpServer>;

    constructor(
        private readonly app: express.Application,
        private readonly dataManager: NeDbWrapper,
        private readonly logger: winston.Logger,
        private readonly validator: SchemaValidator,
        private readonly oidcProvider: any,
    ) {
        this.server = buildMcpServer(this.dataManager, this.logger, this.validator);
        this.mount();
    }

    public async close(): Promise<void> {
        await this.server.close();
    }

    private mount(): void {
        this.app.all('/mcp', async (req: express.Request, res: express.Response) => {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });

            const cleanup = () => {
                transport.close();
            };

            (res as ServerResponse & { on: (event: string, cb: () => void) => void }).on('close', cleanup);

            try {
                const result = await authenticateRequest(req, this.dataManager, this.oidcProvider);
                if (!result) {
                    res.status(401).json({error: 'Unauthorized'});
                    cleanup();
                    return;
                }
                await mcpAuthContext.run({userid: result.userid}, async () => {
                    await this.server.connect(transport);
                    await transport.handleRequest(req, res, req.body);
                });
            } catch (err: any) {
                this.logger.error(`MCP request failed: ${err}`);
                if (!res.headersSent) {
                    res.status(500).json({error: 'MCP error'});
                }
                cleanup();
            }
        });
    }
}