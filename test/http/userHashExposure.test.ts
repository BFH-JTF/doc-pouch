import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    closeTestServer,
    createTestUsers,
    cleanupTestDatabase,
} from '../setup/testSetup.js';

// Regression tests for #112: bcrypt password hashes must not leak across
// the REST boundary. /users/list always strips them; /database/export
// strips them unless the request explicitly opts in via includeHashes=true
// (backup fidelity), mirroring what the MCP tools already did.

describe('Password hash exposure (#112)', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        dataManager = setup.dataManager;
        networkManager = setup.networkManager;
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;
    });

    test('/users/list never returns password hashes', async () => {
        const adminView = await request(server)
            .get('/users/list')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(adminView.status).toBe(200);
        expect(adminView.body.length).toBeGreaterThan(0);
        for (const user of adminView.body) {
            expect(user).not.toHaveProperty('password');
        }

        const userView = await request(server)
            .get('/users/list')
            .set('Authorization', `Bearer ${userToken}`);
        expect(userView.status).toBe(200);
        for (const user of userView.body) {
            expect(user).not.toHaveProperty('password');
        }
    });

    test('database export strips hashes by default', async () => {
        const res = await request(server)
            .get('/database/export')
            .query({scope: 'all', format: 'json'})
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        const data = JSON.parse(res.text);
        expect(data.users.length).toBeGreaterThan(0);
        for (const user of data.users) {
            expect(user).not.toHaveProperty('password');
        }
    });

    test('scoped user export strips hashes by default', async () => {
        const res = await request(server)
            .get('/database/export')
            .query({scope: 'users', format: 'json'})
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        const users = JSON.parse(res.text);
        expect(users.length).toBeGreaterThan(0);
        for (const user of users) {
            expect(user).not.toHaveProperty('password');
        }
    });

    test('includeHashes=true restores hashes for backups', async () => {
        const res = await request(server)
            .get('/database/export')
            .query({scope: 'all', format: 'json', includeHashes: 'true'})
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        const data = JSON.parse(res.text);
        for (const user of data.users) {
            expect(user.password).toMatch(/^\$2[aby]\$/);
        }
    });

    test('MCP parity: the data layer already serves stripped records', async () => {
        const adminId = (await dataManager.getUserByEmail('admin@example.com'))._id;
        const list = await dataManager.getUsers(adminId);
        expect(list.length).toBeGreaterThan(0);
        for (const user of list) {
            expect(user).not.toHaveProperty('password');
        }
    });
});