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

// Regression tests for #109: API keys are the only bearer credential for
// the API, so the key material must come from a CSPRNG. The previous
// implementation derived 32 bytes from Math.random(), whose state can be
// recovered from observed output.

const KEY_BODY_RE = /^[0-9a-f]{64}$/;

describe('API key generation (#109)', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;
    let userToken: string;
    let userId: string;

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
        userToken = users.userToken;
        userId = users.regularUser._id;
    });

    test('unit level: keys are CSPRNG hex, unique and verifiable', async () => {
        const first = await dataManager.apiKeys.createApiKey(userId, 'unit-first');
        const second = await dataManager.apiKeys.createApiKey(userId, 'unit-second');

        expect(first.key).toMatch(/^docpouch_key_/);
        const firstBody = first.key.substring('docpouch_key_'.length);
        const secondBody = second.key.substring('docpouch_key_'.length);
        expect(firstBody).toMatch(KEY_BODY_RE);
        expect(secondBody).toMatch(KEY_BODY_RE);
        expect(firstBody).not.toBe(secondBody);

        // Record ids must be unique as well (previously Math.random-based).
        expect(first.key).not.toBe(second.key);

        const verified = await dataManager.apiKeys.verifyApiKey(first.key);
        expect(verified).toEqual({userId, keyId: expect.any(String)});

        const wrongKey = `docpouch_key_${'0'.repeat(64)}`;
        const rejected = await dataManager.apiKeys.verifyApiKey(wrongKey);
        expect(rejected).toBeNull();
    });

    test('REST level: a generated key authenticates against a protected endpoint', async () => {
        const createRes = await request(server)
            .post('/api-keys/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send({name: 'ci-key'});

        expect(createRes.status).toBe(200);
        expect(createRes.body.key).toMatch(/^docpouch_key_[0-9a-f]{64}$/);

        const whoamiRes = await request(server)
            .get('/users/whoami')
            .set('Authorization', `Bearer ${createRes.body.key}`);

        expect(whoamiRes.status).toBe(200);
        expect(whoamiRes.body._id).toBe(userId);
    });

    test('REST level: two keys generated for different requests differ', async () => {
        const firstRes = await request(server)
            .post('/api-keys/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send({name: 'a'});
        const secondRes = await request(server)
            .post('/api-keys/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send({name: 'b'});

        expect(firstRes.status).toBe(200);
        expect(secondRes.status).toBe(200);
        expect(firstRes.body.key).not.toBe(secondRes.body.key);
    });
});