import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type winston from 'winston';
import {CheckVersionSchema} from '../schemas.js';
import {getCachedUpdateResult} from '../../updateChecker.js';

export function registerSystemTools(
    server: McpServer,
    logger: winston.Logger,
): void {
    server.registerTool('check_version', {
        description: 'Check whether a newer version of docPouch is available. Returns the current installed version, the latest available version from the remote repository, and a boolean indicating whether an update is available. This is a public endpoint — no authentication required. The update check is performed periodically in the background; this tool returns the most recently cached result. If no check has been performed yet (e.g., on first startup), an error is returned.',
        inputSchema: CheckVersionSchema,
    }, async () => {
        try {
            const result = getCachedUpdateResult();
            if (!result) {
                return {
                    content: [{
                        type: 'text',
                        text: 'Error: version check not available yet — the server may have just started and the background check has not completed'
                    }], isError: true
                };
            }
            return {content: [{type: 'text', text: JSON.stringify(result)}]};
        } catch (error: unknown) {
            logger.error(`MCP check_version error: ${error instanceof Error ? error.message : String(error)}`);
            return {
                content: [{type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}`}],
                isError: true
            };
        }
    });
}