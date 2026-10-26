import request from 'supertest';
import {Server} from 'http';
import os from 'os';
import path from 'path';
import winston from 'winston';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import EmailService from '../../src/srv/EmailService.js';
import {clearAllOidcData, initOidcDatabases} from '../../src/srv/OidcAdapter.js';
import {
    setupOidcTestServer,
    closeOidcTestServer,
    OIDC_REGISTRATION_TOKEN,
} from '../setup/testSetup.js';
import type {I_CorsOption} from '../../src/types.js';

// Regression tests for #107: dynamic client registration must fail
// closed. When OIDC_REGISTRATION_TOKEN is configured, POST /oidc/reg
// requires it as a bearer token; when it is unset (or blank), the
// registration feature is disabled entirely.

const TEST_PORT = 3033;

function buildLogger(): winston.Logger {
    return winston.createLogger({
        level: 'error',
        transports: [new winston.transports.Console()],
    });
}

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(keys: string[]): EnvSnapshot {
    const snapshot: EnvSnapshot = {};
    for (const key of keys) {
        snapshot[key] = process.env[key];
    }
    return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
    for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}

describe('OIDC dynamic client registration gating', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let restoreEnv_: () => void;

    beforeAll(async () => {
        const setup = await setupOidcTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        restoreEnv_ = setup.restoreEnv;
    });

    afterAll(async () => {
        await closeOidcTestServer(networkManager);
        restoreEnv_();
    });

    test('with a configured token: registration without the token is rejected', async () => {
        const res = await request(server)
            .post('/oidc/reg')
            .send({
                client_name: 'Tokenless App',
                redirect_uris: ['http://localhost:9999/callback'],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
            });

        expect(res.status).toBe(401);
    });

    test('with a configured token: registration with the token succeeds', async () => {
        const res = await request(server)
            .post('/oidc/reg')
            .set('Authorization', `Bearer ${OIDC_REGISTRATION_TOKEN}`)
            .send({
                client_name: 'Third Party Test App',
                redirect_uris: ['http://localhost:3032/third-party-callback'],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                token_endpoint_auth_method: 'none',
                application_type: 'web',
            });

        expect(res.status).toBe(201);
        expect(res.body.client_id).toBeTruthy();
    });

    describe('when OIDC_REGISTRATION_TOKEN is unset or blank', () => {
        let disabledServer: Server;
        let disabledManager: NetworkManager;
        let restoreDisabledEnv: () => void;

        beforeAll(async () => {
            const snapshot = snapshotEnv([
                'OIDC_ISSUER',
                'OIDC_REDIRECT_URI',
                'OIDC_POST_LOGOUT_REDIRECT_URI',
                'OIDC_REGISTRATION_TOKEN',
                'OIDC_COOKIE_KEY',
                'OIDC_COOKIE_SECURE',
            ]);

            process.env.OIDC_ISSUER = `http://localhost:${TEST_PORT}/oidc`;
            process.env.OIDC_REDIRECT_URI = `http://localhost:${TEST_PORT}/`;
            process.env.OIDC_POST_LOGOUT_REDIRECT_URI = `http://localhost:${TEST_PORT}/`;
            // A blank value must fail closed exactly like an unset value.
            process.env.OIDC_REGISTRATION_TOKEN = '   ';
            process.env.OIDC_COOKIE_KEY = 'docpouch-test-cookie-key-no-registration';
            process.env.OIDC_COOKIE_SECURE = 'false';

            initOidcDatabases(path.join(os.tmpdir(), `docpouch-oidc-test-noreg-${process.pid}-${Date.now()}`), true);
            await clearAllOidcData();

            const logger = buildLogger();
            const dataManager = new NeDbWrapper(logger, {inMemoryOnly: true});
            await dataManager.waitForInitialization();
            const emailService = new EmailService(null, logger, `http://localhost:${TEST_PORT}`);
            const corsOptions: I_CorsOption = {origin: `http://localhost:${TEST_PORT}`};
            disabledManager = new NetworkManager(logger, dataManager, TEST_PORT, corsOptions, {}, emailService);
            await new Promise(resolve => setTimeout(resolve, 100));
            disabledServer = disabledManager.webServer;

            restoreDisabledEnv = () => restoreEnv(snapshot);
        });

        afterAll(async () => {
            await new Promise<void>(resolve => {
                disabledManager.stop().then(() => resolve());
            });
            restoreDisabledEnv();
        });

        test('the registration endpoint is disabled (unauthenticated requests get no access)', async () => {
            const res = await request(disabledServer)
                .post('/oidc/reg')
                .send({
                    client_name: 'Open Registration Probe',
                    redirect_uris: ['http://localhost:9999/callback'],
                    grant_types: ['authorization_code'],
                    response_types: ['code'],
                    token_endpoint_auth_method: 'none',
                });

            // With the feature disabled the route is not mounted at all.
            // The important property: no 201 — registration is not open.
            expect(res.status).not.toBe(201);
            expect(res.status).not.toBe(200);
        });
    });
});