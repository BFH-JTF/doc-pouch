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

describe('Version Check API', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;

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
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('GET /version/check returns 200 with a result object or 503 if not yet cached', async () => {
        const response = await authenticatedRequest(server, adminToken).get('/version/check');
        // May return 200 with a result object (when the update checker has
        // been able to reach the network) or 503 when the cached result is
        // not available yet.
        expect([200, 503]).toContain(response.status);
        if (response.status === 200) {
            expect(response.body).toHaveProperty('hasUpdate');
            expect(response.body).toHaveProperty('currentVersion');
            expect(response.body).toHaveProperty('latestVersion');
            expect(typeof response.body.hasUpdate).toBe('boolean');
        } else {
            expect(response.body).toHaveProperty('error');
        }
    });

    test('GET /version/check requires authentication (#117)', async () => {
        const response = await request(server).get('/version/check');
        // The exact server version must not be disclosed anonymously.
        expect(response.status).toBe(401);
    });
});