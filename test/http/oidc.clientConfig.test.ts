import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import OidcAdapter from '../../src/srv/OidcAdapter.js';
import {
    setupOidcTestServer,
    cleanupOidcState,
    createTestUsers,
    cleanupTestDatabase,
    closeOidcTestServer,
} from '../setup/testSetup.js';

// Regression tests for #106: the (unauthenticated) OIDC client config
// endpoint must derive the redirect URIs of the first-party client from
// trusted configuration (OIDC_ISSUER / OIDC_REDIRECT_URI), never from the
// client-controlled Host or X-Forwarded-Proto request headers.

const EXPECTED_REDIRECT_URI = 'http://localhost:3032/';
const EXPECTED_POST_LOGOUT_URI = 'http://localhost:3032/';
const EXPECTED_LOGOUT_REDIRECT_URI = 'http://localhost:3032/oidc/logout-redirect';

describe('OIDC client config endpoint redirect URI derivation', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;
    let restoreEnv: () => void;

    beforeAll(async () => {
        const setup = await setupOidcTestServer();
        server = setup.server;
        dataManager = setup.dataManager;
        networkManager = setup.networkManager;
        restoreEnv = setup.restoreEnv;
    });

    afterAll(async () => {
        await closeOidcTestServer(networkManager);
        restoreEnv();
    });

    beforeEach(async () => {
        await cleanupOidcState();
        await cleanupTestDatabase(dataManager);
        await createTestUsers(dataManager);
    });

    test('a spoofed Host header never reaches the response or the client record', async () => {
        const res = await request(server)
            .get('/api/oidc-client-config')
            .set('Host', 'attacker.example')
            .set('X-Forwarded-Proto', 'https');

        expect(res.status).toBe(200);
        expect(res.body.configured).toBe(true);
        // The redirect URIs must come from the issuer, not the request headers.
        expect(res.body.redirectUri).toBe(EXPECTED_REDIRECT_URI);
        expect(res.body.postLogoutRedirectUri).toBe(EXPECTED_LOGOUT_REDIRECT_URI);
        expect(JSON.stringify(res.body)).not.toContain('attacker.example');

        const clientAdapter = new OidcAdapter('Client');
        const client = await clientAdapter.find('docpouch-admin-ui');
        expect(client).toBeDefined();
        expect(client.redirect_uris).toEqual([EXPECTED_REDIRECT_URI]);
        expect(client.post_logout_redirect_uris).toEqual([EXPECTED_POST_LOGOUT_URI, EXPECTED_LOGOUT_REDIRECT_URI]);
        expect(JSON.stringify(client)).not.toContain('attacker.example');
    });

    test('URIs registered from request headers by older versions are purged', async () => {
        // First call seeds/normalizes the client record.
        await request(server).get('/api/oidc-client-config');

        // Simulate a record poisoned by a previous version that derived
        // the URIs from request headers.
        const clientAdapter = new OidcAdapter('Client');
        const existing = await clientAdapter.find('docpouch-admin-ui');
        expect(existing).toBeDefined();
        await clientAdapter.upsert('docpouch-admin-ui', {
            ...existing,
            redirect_uris: ['http://attacker.example/', EXPECTED_REDIRECT_URI, 'http://other.example/'],
            post_logout_redirect_uris: ['http://attacker.example/oidc/logout-redirect'],
        }, existing.expiresAt);

        const res = await request(server).get('/api/oidc-client-config');
        expect(res.status).toBe(200);

        // The endpoint replaces the stored lists with the trusted set.
        const client = await clientAdapter.find('docpouch-admin-ui');
        expect(client.redirect_uris).toEqual([EXPECTED_REDIRECT_URI]);
        expect(client.post_logout_redirect_uris).toEqual([EXPECTED_POST_LOGOUT_URI, EXPECTED_LOGOUT_REDIRECT_URI]);
    });

    test('repeated calls with different spoofed hosts do not grow the redirect URI list', async () => {
        await request(server).get('/api/oidc-client-config').set('Host', 'spoof-one.example');
        await request(server).get('/api/oidc-client-config').set('Host', 'spoof-two.example');

        const clientAdapter = new OidcAdapter('Client');
        const client = await clientAdapter.find('docpouch-admin-ui');
        expect(client.redirect_uris).toEqual([EXPECTED_REDIRECT_URI]);
        expect(client.redirect_uris).toHaveLength(1);
        expect(client.post_logout_redirect_uris).toHaveLength(2);
    });
});