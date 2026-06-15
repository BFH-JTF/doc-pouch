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

describe('MCP User Tools', () => {
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

    test('whoami returns current user info', async () => {
        const response = await mcpRequest('tools/call', {
            name: 'whoami',
            arguments: {},
        }, adminToken);
        expect(response.status).not.toBe(401);
    });

    test('non-admin cannot list all users', async () => {
        const response = await mcpRequest('tools/call', {
            name: 'list_users',
            arguments: {},
        }, userToken);
        expect(response.status).not.toBe(401);
        const body = typeof response.body === 'object' ? response.body : JSON.parse(response.text);
        const content = body?.result?.content?.[0]?.text;
        if (content) {
            const users = JSON.parse(content);
            expect(users.length).toBe(1);
        }
    });

    test('admin can list all users', async () => {
        const response = await mcpRequest('tools/call', {
            name: 'list_users',
            arguments: {},
        }, adminToken);
        expect(response.status).not.toBe(401);
        const body = typeof response.body === 'object' ? response.body : JSON.parse(response.text);
        const content = body?.result?.content?.[0]?.text;
        if (content) {
            const users = JSON.parse(content);
            expect(users.length).toBe(2);
        }
    });

    test('non-admin cannot create user', async () => {
        const response = await mcpRequest('tools/call', {
            name: 'create_user',
            arguments: {
                name: 'newuser',
                password: 'password123',
                department: 'IT',
                group: 'Users',
                isAdmin: false,
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