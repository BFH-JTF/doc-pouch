import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    authenticatedRequest
} from '../setup/testSetup.js';
import type {I_UserEntry} from 'docpouch-client';

describe('Whoami API', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminUser: I_UserEntry;
    let regularUser: I_UserEntry;

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
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('GET /users/whoami returns the current user for an admin', async () => {
        const response = await authenticatedRequest(server, adminToken).get('/users/whoami');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('_id', adminUser._id);
        expect(response.body).toHaveProperty('name', 'admin');
        expect(response.body).toHaveProperty('isAdmin', true);
        expect(response.body).toHaveProperty('email', 'admin@example.com');
        // #140: the credential metadata reveals the authentication method.
        expect(response.body.auth).toEqual({type: 'jwt'});
    });

    test('GET /users/whoami returns the current user for a regular user', async () => {
        const response = await authenticatedRequest(server, userToken).get('/users/whoami');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('_id', regularUser._id);
        expect(response.body).toHaveProperty('name', 'user');
        expect(response.body).toHaveProperty('isAdmin', false);
        expect(response.body.auth).toEqual({type: 'jwt'});
    });

    test('GET /users/whoami with an API key reports the apiKey credential type (#140)', async () => {
        const created = await dataManager.apiKeys.createApiKey(regularUser._id, 'whoami-test');
        const response = await authenticatedRequest(server, created.key).get('/users/whoami');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('_id', regularUser._id);
        expect(response.body.auth).toEqual({type: 'apiKey'});
    });

    test('GET /users/whoami without authentication returns 401', async () => {
        const response = await request(server).get('/users/whoami');
        expect(response.status).toBe(401);
    });

    test('GET /users/whoami with an invalid token returns 401', async () => {
        const response = await authenticatedRequest(server, 'invalid-token').get('/users/whoami');
        expect(response.status).toBe(401);
    });
});
