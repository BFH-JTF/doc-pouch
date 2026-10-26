import {Server} from 'http';
import winston from 'winston';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import EmailService from '../../src/srv/EmailService.js';
import {createTestUsers, cleanupTestDatabase} from '../setup/testSetup.js';
import type {I_CorsOption} from '../../src/types.js';

// Regression tests for #108 (server level):
// - constructing the server in production mode without OIDC_COOKIE_KEY fails
// - the bootstrap admin account no longer has the hardcoded password
// - ADMIN_INITIAL_PASSWORD is honored and validated

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

const PRODUCTION_TEST_PORT = 3034;

describe('Production fail-closed secrets (#108)', () => {
    const snapshot = snapshotEnv([
        'NODE_ENV',
        'OIDC_ISSUER',
        'OIDC_REDIRECT_URI',
        'OIDC_POST_LOGOUT_REDIRECT_URI',
        'OIDC_REGISTRATION_TOKEN',
        'OIDC_COOKIE_KEY',
        'OIDC_COOKIE_SECURE',
        'ADMIN_INITIAL_PASSWORD',
    ]);

    beforeEach(() => {
        // Preconfigure the bootstrap admin password so the one-time stdout
        // banner (printed in production mode) does not pollute test output.
        process.env.ADMIN_INITIAL_PASSWORD = 'production-test-bootstrap-pw';
    });

    afterEach(() => {
        restoreEnv(snapshot);
    });

    test('NetworkManager refuses to start in production without OIDC_COOKIE_KEY', async () => {
        process.env.NODE_ENV = 'production';
        process.env.OIDC_ISSUER = `http://localhost:${PRODUCTION_TEST_PORT}/oidc`;
        process.env.OIDC_REDIRECT_URI = `http://localhost:${PRODUCTION_TEST_PORT}/`;
        delete process.env.OIDC_COOKIE_KEY;

        const logger = buildLogger();
        const dataManager = new NeDbWrapper(logger, {inMemoryOnly: true});
        await dataManager.waitForInitialization();
        const emailService = new EmailService(null, logger, `http://localhost:${PRODUCTION_TEST_PORT}`);
        const corsOptions: I_CorsOption = {origin: `http://localhost:${PRODUCTION_TEST_PORT}`};

        expect(() => new NetworkManager(logger, dataManager, PRODUCTION_TEST_PORT, corsOptions, {}, emailService))
            .toThrow(/OIDC_COOKIE_KEY/);
    });

    test('NetworkManager refuses to start in production with a blank OIDC_COOKIE_KEY', async () => {
        process.env.NODE_ENV = 'production';
        process.env.OIDC_ISSUER = `http://localhost:${PRODUCTION_TEST_PORT}/oidc`;
        process.env.OIDC_REDIRECT_URI = `http://localhost:${PRODUCTION_TEST_PORT}/`;
        process.env.OIDC_COOKIE_KEY = '   ';

        const logger = buildLogger();
        const dataManager = new NeDbWrapper(logger, {inMemoryOnly: true});
        await dataManager.waitForInitialization();
        const emailService = new EmailService(null, logger, `http://localhost:${PRODUCTION_TEST_PORT}`);
        const corsOptions: I_CorsOption = {origin: `http://localhost:${PRODUCTION_TEST_PORT}`};

        expect(() => new NetworkManager(logger, dataManager, PRODUCTION_TEST_PORT, corsOptions, {}, emailService))
            .toThrow(/OIDC_COOKIE_KEY/);
    });
});

describe('Bootstrap administrator (#108)', () => {
    const snapshot = snapshotEnv(['ADMIN_INITIAL_PASSWORD']);
    let dataManager: NeDbWrapper | undefined;

    afterEach(async () => {
        if (dataManager) {
            dataManager.stop();
            dataManager = undefined;
        }
        restoreEnv(snapshot);
    });

    test('the bootstrap admin no longer uses the hardcoded password', async () => {
        delete process.env.ADMIN_INITIAL_PASSWORD;

        dataManager = new NeDbWrapper(buildLogger(), {inMemoryOnly: true});
        await dataManager.waitForInitialization();

        const legacyResult = await dataManager.validateUser('admin', 'adminSecret');
        expect(legacyResult).toBe(401);

        const missingResult = await dataManager.validateUser('admin', '');
        expect(missingResult).toBe(401);
    });

    test('ADMIN_INITIAL_PASSWORD is honored for the bootstrap admin', async () => {
        process.env.ADMIN_INITIAL_PASSWORD = 'operator-chosen-pw-1234';

        dataManager = new NeDbWrapper(buildLogger(), {inMemoryOnly: true});
        await dataManager.waitForInitialization();

        const user = await dataManager.validateUser('admin', 'operator-chosen-pw-1234');
        expect(typeof user).toBe('object');
        expect((user as any).isAdmin).toBe(true);
    });

    test('a too-short ADMIN_INITIAL_PASSWORD fails initialization', async () => {
        process.env.ADMIN_INITIAL_PASSWORD = 'short';

        dataManager = new NeDbWrapper(buildLogger(), {inMemoryOnly: true});
        await expect(dataManager.waitForInitialization()).rejects.toThrow(/ADMIN_INITIAL_PASSWORD/);
    });
});