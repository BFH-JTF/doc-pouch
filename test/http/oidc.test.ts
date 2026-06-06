import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer
} from '../setup/testSetup.js';

describe('OIDC Discovery and Config API', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        await createTestUsers(dataManager);
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    describe('GET /api/oidc-client-config', () => {
        test('returns the configured OIDC client information', async () => {
            const response = await request(server).get('/api/oidc-client-config');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('configured', true);
            expect(response.body).toHaveProperty('issuer');
            expect(response.body).toHaveProperty('clientId');
            expect(response.body).toHaveProperty('redirectUri');
            expect(response.body).toHaveProperty('scope');
        });
    });

    describe('GET /.well-known/openid-configuration', () => {
        test('returns the proxied OIDC discovery document', async () => {
            const response = await request(server).get('/.well-known/openid-configuration');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('issuer');
            expect(response.body).toHaveProperty('authorization_endpoint');
            expect(response.body).toHaveProperty('token_endpoint');
            expect(response.body).toHaveProperty('jwks_uri');
            expect(response.body).toHaveProperty('response_types_supported');
            expect(response.body.response_types_supported).toContain('code');
        });
    });

    describe('GET /oidc/.well-known/openid-configuration', () => {
        test('returns the OIDC discovery document directly from the provider', async () => {
            const response = await request(server).get('/oidc/.well-known/openid-configuration');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('issuer');
            expect(response.body).toHaveProperty('scopes_supported');
            // The server configures these scopes
            expect(response.body.scopes_supported).toEqual(
                expect.arrayContaining(['openid', 'profile', 'email', 'offline_access'])
            );
        });
    });

    describe('GET /oidc/jwks', () => {
        test('exposes the JWKS public key set', async () => {
            const response = await request(server).get('/oidc/jwks');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('keys');
            expect(Array.isArray(response.body.keys)).toBe(true);
            expect(response.body.keys.length).toBeGreaterThan(0);
            const key = response.body.keys[0];
            expect(key).toHaveProperty('kty');
            expect(key).toHaveProperty('alg');
        });
    });
});
