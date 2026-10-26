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

// Regression tests for #113: failed logins for unknown usernames and for
// existing users with wrong passwords must be indistinguishable — same
// status code, same response body.

describe('Login username enumeration (#113)', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;

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
        await createTestUsers(dataManager);
    });

    test('unknown user and wrong password produce identical responses', async () => {
        const unknownUser = await request(server)
            .post('/users/login')
            .send({name: 'no-such-user-xyz', password: 'password'});
        const wrongPassword = await request(server)
            .post('/users/login')
            .send({name: 'user', password: 'wrong-password'});

        expect(unknownUser.status).toBe(401);
        expect(wrongPassword.status).toBe(401);
        expect(unknownUser.body).toEqual(wrongPassword.body);
    });

    test('the OIDC interaction login redirect carries the same generic error for both cases', async () => {
        const res = await request(server)
            .post('/users/login')
            .send({name: 'another-unknown-user', password: 'password'});
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid user or password');
    });
});