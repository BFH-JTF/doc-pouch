import request from 'supertest';
import {Server} from 'http';
import winston from 'winston';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import EmailService from '../../src/srv/EmailService.js';
import {
    setupTestServer,
    closeTestServer,
    createTestUsers,
    cleanupTestDatabase,
} from '../setup/testSetup.js';

// Regression tests for #110: the self-service password reset flow was
// broken in two ways — the emailed link was doubly concatenated
// (NetworkManager/MCP passed a full URL that EmailService prefixed again)
// and the SPA had no /reset-password view. The link is now built once,
// in EmailService, from its configured base URL (never from request
// headers).

function buildLogger(): winston.Logger {
    return winston.createLogger({
        level: 'error',
        transports: [new winston.transports.Console()],
    });
}

describe('EmailService.buildResetUrl (#110)', () => {
    test('builds the reset link exactly once from the configured base URL', () => {
        const service = new EmailService(null, buildLogger(), 'https://docpouch.example.com');
        const url = service.buildResetUrl('abc123');
        expect(url).toBe('https://docpouch.example.com/reset-password?token=abc123');
    });

    test('a raw token is not treated as a URL', () => {
        const service = new EmailService(null, buildLogger(), 'http://localhost:3030');
        const url = service.buildResetUrl('deadbeef');
        expect(url).toBe('http://localhost:3030/reset-password?token=deadbeef');
        expect(url.match(/reset-password/g)).toHaveLength(1);
    });
});

describe('Self-service password reset flow (#110)', () => {
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
        // The flow test creates one token via forgot-password that is
        // (deliberately) never consumed — clear the store between tests.
        await dataManager.passwordResetTokens.remove({});
    });

    async function storedResetTokenRecords(): Promise<any[]> {
        return dataManager.passwordResetTokens.query({}) as Promise<any[]>;
    }

    test('forgot-password issues a single-use token and reset-password completes the flow', async () => {
        // 1. Request the reset link.
        const forgotRes = await request(server)
            .post('/users/forgot-password')
            .send({email: 'user@example.com'});
        expect(forgotRes.status).toBe(200);
        expect(forgotRes.body.message).toBe('If an account with that email exists, a reset link has been sent.');

        // 2. The token store holds exactly one record for the user, and it
        //    stores only a SHA-256 hash of the token (#119), never the raw
        //    token itself.
        const records = await storedResetTokenRecords();
        expect(records).toHaveLength(1);
        expect(records[0]).toHaveProperty('tokenHash');
        expect(records[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(records[0]).not.toHaveProperty('token');

        // 3. Obtain a raw token the way the emailed link would carry it.
        const regularUserId = (await dataManager.getUserByEmail('user@example.com'))._id;
        const rawToken = await dataManager.createPasswordResetToken(regularUserId);
        expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
        const corresponding = await storedResetTokenRecords();
        const matching = corresponding.filter((r: any) => r.tokenHash !== rawToken);
        // The stored hash is NOT the raw token (it is its SHA-256).
        expect(matching.length).toBe(corresponding.length);

        // 4. Reset the password with the raw token.
        const resetRes = await request(server)
            .post('/users/reset-password')
            .send({token: rawToken, password: 'brand-new-password'});
        expect(resetRes.status).toBe(200);

        // 5. Login with the new password works, the old one does not.
        const newLogin = await request(server)
            .post('/users/login')
            .send({name: 'user', password: 'brand-new-password'});
        expect(newLogin.status).toBe(200);

        const oldLogin = await request(server)
            .post('/users/login')
            .send({name: 'user', password: 'userpassword'});
        expect(oldLogin.status).toBe(401);

        // 6. The token was consumed: a second reset attempt fails.
        const reuseRes = await request(server)
            .post('/users/reset-password')
            .send({token: rawToken, password: 'another-password-1'});
        expect(reuseRes.status).toBe(400);
    });

    test('forgot-password with an unknown email stays generic and issues no token', async () => {
        const res = await request(server)
            .post('/users/forgot-password')
            .send({email: 'unknown@example.com'});

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('If an account with that email exists, a reset link has been sent.');
        expect(await storedResetTokenRecords()).toHaveLength(0);
    });

    test('reset-password rejects an invalid token', async () => {
        const res = await request(server)
            .post('/users/reset-password')
            .send({token: 'not-a-real-token', password: 'somepassword1'});
        expect(res.status).toBe(400);
    });
});