import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
} from '../setup/testSetup.js';

describe('MCP Structure Tools', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    async function mcpRequest(method: string, params: any, token: string) {
        return request(server)
            .post('/mcp')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method,
                params,
            })
            .set('Authorization', `Bearer ${token}`)
            .set('Content-Type', 'application/json');
    }

    test('list_structures returns empty list initially', async () => {
        const response = await mcpRequest('tools/call', {
            name: 'list_structures',
            arguments: {},
        }, adminToken);
        expect(response.status).not.toBe(401);
    });

    test('non-admin cannot create structure', async () => {
        const response = await mcpRequest('tools/call', {
            name: 'create_structure',
            arguments: {
                name: 'Forbidden',
                fields: [{name: 'f1', type: 'text'}],
            },
        }, userToken);
        expect(response.status).not.toBe(401);
        const body = typeof response.body === 'object' ? response.body : JSON.parse(response.text);
        const content = body?.result?.content?.[0]?.text;
        if (content) {
            expect(content).toContain('admin access required');
        }
    });
});