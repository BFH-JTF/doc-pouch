import request from 'supertest';
import {Server} from 'http';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {parseDurationToSeconds} from '../../src/srv/webTokenStuff.js';
import {
    setupTestServer,
    closeTestServer,
    createTestUsers,
    cleanupTestDatabase,
} from '../setup/testSetup.js';

// Regression tests for the hardening backlog (#119).

describe('Security hardening backlog (#119)', () => {
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

    describe('Content-Security-Policy on static/SPA responses', () => {
        test('the SPA index is served with a CSP header', async () => {
            const response = await request(server).get('/');
            expect(response.status).toBe(200);
            const csp = response.headers['content-security-policy'];
            expect(csp).toBeDefined();
            expect(csp).toContain("script-src 'self' 'nonce-");
            // strict-dynamic was removed: it makes browsers ignore the
            // 'self' allowlist, which would block the SPA's script tags.
            expect(csp).not.toContain('strict-dynamic');
        });

        test('API responses keep their CSP header', async () => {
            const response = await request(server).get('/users/whoami');
            expect(response.headers['content-security-policy']).toBeDefined();
        });
    });

    describe('/oidc/static mount restriction', () => {
        test('serves the login-page logo', async () => {
            const response = await request(server).get('/oidc/static/docPouch.png');
            expect(response.status).toBe(200);
        });

        test('no longer exposes compiled backend code', async () => {
            // main.js lives in dist/srv (the compiled backend), which the
            // mount previously served in its entirety.
            const response = await request(server).get('/oidc/static/main.js');
            expect(response.status).toBe(404);
        });
    });

    describe('JWT verification pinning', () => {
        const secret = process.env.JWT_SECRET as string;

        test('a token signed with a different algorithm is rejected', async () => {
            const token = jwt.sign({id: 'someone'}, secret, {algorithm: 'HS256', expiresIn: '1h', issuer: 'DocPouch'});
            const response = await request(server)
                .get('/users/whoami')
                .set('Authorization', `Bearer ${token}`);
            expect(response.status).toBe(401);
        });

        test('a token from a different issuer is rejected', async () => {
            const token = jwt.sign({id: 'someone'}, secret, {algorithm: 'HS512', expiresIn: '1h', issuer: 'Other'});
            const response = await request(server)
                .get('/users/whoami')
                .set('Authorization', `Bearer ${token}`);
            expect(response.status).toBe(401);
        });

        test('a correctly issued token is accepted', async () => {
            const response = await request(server)
                .get('/users/whoami')
                .set('Authorization', `Bearer ${userToken}`);
            expect(response.status).toBe(200);
        });
    });

    describe('duration parsing', () => {
        test('explicit fallbacks distinguish invalid values from "1d"', () => {
            // "1d" is valid and must not silently become the caller's
            // default (previously 86400 was ambiguous).
            expect(parseDurationToSeconds('1d', -1)).toBe(86400);
            expect(parseDurationToSeconds('2d', -1)).toBe(172800);
            expect(parseDurationToSeconds('garbage', -1)).toBe(-1);
            expect(parseDurationToSeconds('', -1)).toBe(-1);
        });

        test('the default fallback stays 24h for backward compatibility', () => {
            expect(parseDurationToSeconds('garbage')).toBe(86400);
            expect(parseDurationToSeconds('30m')).toBe(1800);
        });
    });

    describe('database import content sniffing', () => {
        test('a .zip-named file without a ZIP magic header is rejected', async () => {
            const response = await request(server)
                .post('/database/import')
                .set('Authorization', `Bearer ${adminToken}`)
                .field('scope', 'all')
                .field('mode', 'replace')
                .attach('file', Buffer.from('{"users":[]}'), {filename: 'not-really-a.zip'});

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('not a valid ZIP');
        });

        test('a rejected upload leaves no new files behind', async () => {
            const uploadsDir = 'uploads';
            const countBefore = fs.existsSync(uploadsDir)
                ? fs.readdirSync(uploadsDir).length
                : 0;

            const response = await request(server)
                .post('/database/import')
                .set('Authorization', `Bearer ${adminToken}`)
                .field('scope', 'all')
                .field('mode', 'replace')
                .attach('file', Buffer.from('{"users":[]}'), {filename: 'not-really-a.zip'});

            expect(response.status).toBe(400);

            const countAfter = fs.existsSync(uploadsDir)
                ? fs.readdirSync(uploadsDir).length
                : 0;
            expect(countAfter).toBe(countBefore);
        });
    });
});