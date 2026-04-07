import request from 'supertest';
import {Server} from 'http';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import NetworkManager from '../../src/srv/NetworkManager.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    authenticatedRequest
} from '../setup/testSetup.js';

describe('Base HTTP Test', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        // Set up the test server
        const setup = await setupTestServer();
        dataManager = setup.dataManager;
        server = setup.server;
        networkManager = setup.networkManager;
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

    test('Server is running', async () => {
        const response = await request(server).get('/');
        expect(response.status).toBe(200);
    });

    test('Unauthenticated request', async () => {
        const response = await authenticatedRequest(server, "xxx").get('/users/list');
        expect(response.status).toBe(401);
    });

    test('Authenticated request', async () => {
        const response = await authenticatedRequest(server, adminToken).get('/users/list');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });
});