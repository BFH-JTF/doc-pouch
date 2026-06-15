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
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'ThisIsMyVeryOwnAndCreativeSecret';

describe.skip('MCP Authentication', () => {
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

    test('POST /mcp without Authorization header returns 401', async () => {
        const response = await request(server)
            .post('/mcp')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: {name: 'test', version: '1.0.0'},
                },
            })
            .set('Content-Type', 'application/json');

        expect(response.status).toBe(401);
    });

    test('POST /mcp with invalid token returns 401', async () => {
        const response = await request(server)
            .post('/mcp')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: {name: 'test', version: '1.0.0'},
                },
            })
            .set('Authorization', 'Bearer invalid-token-here')
            .set('Content-Type', 'application/json');

        expect(response.status).toBe(401);
    });

    test('POST /mcp with valid JWT token passes auth (200 or valid MCP response)', async () => {
        const response = await request(server)
            .post('/mcp')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2025-03-26',
                    capabilities: {},
                    clientInfo: {name: 'test', version: '1.0.0'},
                },
            })
            .set('Authorization', `Bearer ${adminToken}`)
            .set('Content-Type', 'application/json');

        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(500);
    });
});