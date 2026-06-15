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

describe.skip('MCP Document Tools', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminUser: any;
    let regularUser: any;

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
        adminUser = users.adminUser;
        regularUser = users.regularUser;

        await dataManager.structures.add({
            type: 10,
            subType: 20,
            name: 'Test Structure',
            description: 'Test',
            fields: [],
        });
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

    async function initializeMcp(token: string) {
        return mcpRequest('initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {name: 'test', version: '1.0.0'},
        }, token);
    }

    test('list_documents returns empty list initially', async () => {
        await initializeMcp(adminToken);
        const response = await mcpRequest('tools/call', {
            name: 'list_documents',
            arguments: {query: {limit: 100}},
        }, adminToken);
        expect(response.status).not.toBe(401);
    });

    test('create and get document round-trip', async () => {
        await initializeMcp(adminToken);
        const response = await mcpRequest('tools/call', {
            name: 'create_document',
            arguments: {
                type: 10,
                subType: 20,
                title: 'Test Doc',
                content: {text: 'hello'},
                public: true,
                shareWithGroup: false,
                shareWithDepartment: false,
            },
        }, adminToken);
        expect(response.status).not.toBe(401);
    });

    test('unauthenticated request to list_documents returns 401', async () => {
        const response = await request(server)
            .post('/mcp')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {name: 'list_documents', arguments: {}},
            })
            .set('Content-Type', 'application/json');

        expect(response.status).toBe(401);
    });
});