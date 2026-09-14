import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import DatabaseWrapper from '../../src/srv/DatabaseWrapper.js';
import StoreFactory, {storeConfigFromEnv} from '../../src/srv/storage/storeFactory.js';
import {MongoDbHandle} from '../../src/srv/storage/MongoStore.js';
import EmailService from '../../src/srv/EmailService.js';
import {clearAllOidcData, setOidcStoreFactory, initOidcDatabases, closeOidcDatabases} from '../../src/srv/OidcAdapter.js';
import winston from 'winston';
import {Writable} from 'stream';
import type {I_CorsOption} from '../../src/types.js';
import type {I_UserCreation, I_UserEntry, I_WsMessage} from 'docpouch-client';
import path from 'path';
import fs from 'fs';
import os from 'os';
import jwt from 'jsonwebtoken';
import request from "supertest";
import type {Socket} from "socket.io-client";

const testLogger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.File({filename: path.join('log', 'test.log')}),
        new winston.transports.Console()
    ]
});

if (!fs.existsSync('log')) {
    fs.mkdirSync('log', {recursive: true});
}

const TEST_PORT = 3031;
const OIDC_TEST_PORT = 3032;
const OIDC_TEST_ISSUER = `http://localhost:${OIDC_TEST_PORT}/oidc`;
const OIDC_TEST_CLIENT_ID = 'docpouch-admin-ui';
const OIDC_TEST_REDIRECT_URI = `http://localhost:${OIDC_TEST_PORT}/`;
const OIDC_TEST_POST_LOGOUT_URI = `http://localhost:${OIDC_TEST_PORT}/`;
const OIDC_TEST_REGISTRATION_TOKEN = 'docpouch-oidc-test-registration-token';
const OIDC_TEST_COOKIE_KEY = 'docpouch-oidc-test-cookie-key';

/**
 * Storage backend used by the test suite. Defaults to in-memory NeDB.
 * Set TEST_STORAGE_BACKEND=mongodb (plus MONGODB_URI) to run the entire
 * suite against the MongoDB backend.
 */
export const TEST_STORAGE_BACKEND = (process.env.TEST_STORAGE_BACKEND || 'nedb').toLowerCase();

let sharedTestStoreFactory: StoreFactory | null = null;

/**
 * Create (once) and await a StoreFactory for the test backend. When
 * TEST_STORAGE_BACKEND=mongodb, MONGODB_URI must point at a disposable
 * database (e.g. an in-memory server started by jest globalSetup).
 */
async function getTestStoreFactory(): Promise<StoreFactory> {
    if (!sharedTestStoreFactory) {
        const config = storeConfigFromEnv({
            STORAGE_BACKEND: TEST_STORAGE_BACKEND,
            MEMORY_ONLY: 'true',
            MONGODB_URI: process.env.MONGODB_URI,
            MONGODB_DB: process.env.MONGODB_DB || 'docpouch_test',
        } as NodeJS.ProcessEnv);
        sharedTestStoreFactory = new StoreFactory(config, testLogger);
        await sharedTestStoreFactory.waitForInitialization();
    }
    return sharedTestStoreFactory;
}

/**
 * Drop all collections of the test database (MongoDB backend only).
 * Used between test files to isolate their state.
 */
export async function resetTestDatabase(): Promise<void> {
    if (TEST_STORAGE_BACKEND !== 'mongodb') return;
    const factory = await getTestStoreFactory();
    const config = storeConfigFromEnv({
        STORAGE_BACKEND: TEST_STORAGE_BACKEND,
        MEMORY_ONLY: 'true',
        MONGODB_URI: process.env.MONGODB_URI,
        MONGODB_DB: process.env.MONGODB_DB || 'docpouch_test',
    } as NodeJS.ProcessEnv);
    const db = await MongoDbHandle.connect(config.mongodb.uri!, config.mongodb.dbName);
    const collections = await db.listCollections().toArray();
    for (const col of collections) {
        await db.collection(col.name).deleteMany({});
    }
    void factory;
}

/**
 * Creates a dedicated winston logger backed by an in-memory buffer of
 * `{level, message, ...meta}` entries. Tests use this to assert that
 * specific log lines were emitted at a specific level.
 */
export function createMemoryTestLogger(level: string = 'debug'): { logger: winston.Logger, entries: any[] } {
    const entries: any[] = [];
    const memoryStream = new Writable({
        write(chunk: Buffer | string, _encoding: string, callback: (error?: Error | null) => void) {
            const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            for (const line of text.split(/\r?\n/)) {
                if (line.length === 0) continue;
                try {
                    entries.push(JSON.parse(line));
                } catch {
                    entries.push({level, message: line});
                }
            }
            callback();
        }
    });
    const memoryTransport = new winston.transports.Stream({
        stream: memoryStream
    });
    const logger = winston.createLogger({
        level,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [memoryTransport]
    });
    return {logger, entries};
}

/**
 * Creates a test server instance
 * @returns {Promise<{networkManager: NetworkManager, dataManager: DatabaseWrapper, server: Server}>}
 */
export async function setupTestServer(options: { anonymousDocumentsEnabled?: boolean } = {}) {
    const storeFactory = await getTestStoreFactory();
    const dataManager = new DatabaseWrapper(testLogger, {inMemoryOnly: true}, {anonymousDocumentsEnabled: options.anonymousDocumentsEnabled}, storeFactory);

    // Wait for database initialization to complete before starting tests
    await dataManager.waitForInitialization();

    const emailService = new EmailService(null, testLogger, 'http://localhost:3031');
    dataManager.setEmailService(emailService);

    // Let NetworkManager create and listen on its own server instance
    const corsOptions: I_CorsOption = {
        origin: `http://localhost:${TEST_PORT}`,
        credentials: 'true'
    };
    const networkManager = new NetworkManager(testLogger, dataManager, TEST_PORT, corsOptions, {anonymousDocumentsEnabled: options.anonymousDocumentsEnabled}, emailService);

    // Wait briefly to let the server start
    await new Promise(resolve => setTimeout(resolve, 100));
    // Return the server that NetworkManager created
    return {networkManager, dataManager, server: networkManager.webServer};
}

// Secret key for JWT generation (this should match what's in your actual app)
const JWT_SECRET = 'ThisIsMyVeryOwnAndCreativeSecret';

/**
 * Creates test users for testing
 * @param {DatabaseWrapper} dataManager - The database manager
 * @returns {Promise<{adminUser: any, regularUser: any, adminToken: string, userToken: string}>}
 */
export async function createTestUsers(dataManager: DatabaseWrapper) {
    const adminUser: I_UserCreation = {
        name: 'admin',
        password: 'adminpassword',
        email: 'admin@example.com',
        department: 'IT',
        group: 'Admins',
        isAdmin: true
    };

    const regularUser: I_UserCreation = {
        name: 'user',
        password: 'userpassword',
        email: 'user@example.com',
        department: 'IT',
        group: 'Users',
        isAdmin: false
    };

    const createdAdminUser = await dataManager.createUser(adminUser);
    const createdRegularUser = await dataManager.createUser(regularUser);

    const adminToken = jwt.sign({id: createdAdminUser._id, isAdmin: true}, JWT_SECRET, {expiresIn: '1h'});
    const userToken = jwt.sign({id: createdRegularUser._id, isAdmin: false}, JWT_SECRET, {expiresIn: '1h'});

    return {
        adminUser: createdAdminUser,
        regularUser: createdRegularUser,
        adminToken,
        userToken
    };
}

export function generateToken(user: I_UserEntry) {
    return jwt.sign({id: user._id, isAdmin: false}, JWT_SECRET, {expiresIn: '1h'})
}

/**
 * Cleans up the test database
 * @param {DatabaseWrapper} dataManager - The database manager
 */
export async function cleanupTestDatabase(dataManager: DatabaseWrapper) {
    // Remove all records from all collections
    await dataManager.users.remove({});
    await dataManager.documents.remove({});
    await dataManager.structures.remove({});
    await dataManager.types.remove({});
    await dataManager.anonymousStructures.remove({});
    await dataManager.passwordResetTokens.remove({});
    try {
        await dataManager.apiKeys.deleteAllForUser('*none*');
    } catch {
        // best-effort: API keys are scoped per user; tests that create
        // keys clean them up themselves
    }
}

export const authenticatedRequest = (server: Server, token: string) => {
    return {
        get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${token}`),
        post: (url: string, body?: any) => {
            const req = request(server).post(url).set('Authorization', `Bearer ${token}`);
            return body !== undefined ? req.send(body) : req;
        },
        patch: (url: string, body?: any) => {
            const req = request(server).patch(url).set('Authorization', `Bearer ${token}`);
            return body !== undefined ? req.send(body) : req;
        },
        delete: (url: string) => request(server).delete(url).set('Authorization', `Bearer ${token}`),
    };
};

export const waitForEvent = (socket: Socket, eventName: string, timeout = 5000) => {
    return new Promise<I_WsMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for event: ${eventName}`));
        }, timeout);

        socket.once(eventName, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
};

/**
 * Closes the test server and cleans up OIDC databases
 */
export async function closeOidcTestServer(target: NetworkManager | Server): Promise<void> {
    await closeTestServer(target);
    await closeOidcDatabases();
}

/**
 * Closes the test server
 */
export function closeTestServer(target: NetworkManager | Server) {
    return new Promise<void>((resolve) => {
        if (target instanceof NetworkManager) {
            target.stop().then(() => resolve());
        } else {
            target.close(() => resolve());
        }
    });
}

export const API_BASE_URL = `http://localhost:${TEST_PORT}`;

export const OIDC_ISSUER_URL = OIDC_TEST_ISSUER;
export const OIDC_CLIENT_ID = OIDC_TEST_CLIENT_ID;
export const OIDC_REDIRECT_URI = OIDC_TEST_REDIRECT_URI;
export const OIDC_POST_LOGOUT_URI = OIDC_TEST_POST_LOGOUT_URI;
export const OIDC_REGISTRATION_TOKEN = OIDC_TEST_REGISTRATION_TOKEN;

/**
 * Snapshot of OIDC-related environment variables so a test can temporarily
 * override them and restore the originals afterwards.
 */
type OidcEnvSnapshot = {
    OIDC_ISSUER?: string;
    OIDC_REDIRECT_URI?: string;
    OIDC_POST_LOGOUT_REDIRECT_URI?: string;
    OIDC_REGISTRATION_TOKEN?: string;
    OIDC_COOKIE_KEY?: string;
    OIDC_COOKIE_SECURE?: string;
};

function snapshotOidcEnv(): OidcEnvSnapshot {
    return {
        OIDC_ISSUER: process.env.OIDC_ISSUER,
        OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI,
        OIDC_POST_LOGOUT_REDIRECT_URI: process.env.OIDC_POST_LOGOUT_REDIRECT_URI,
        OIDC_REGISTRATION_TOKEN: process.env.OIDC_REGISTRATION_TOKEN,
        OIDC_COOKIE_KEY: process.env.OIDC_COOKIE_KEY,
        OIDC_COOKIE_SECURE: process.env.OIDC_COOKIE_SECURE,
    };
}

function restoreOidcEnv(snapshot: OidcEnvSnapshot): void {
    for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}

function applyOidcTestEnv(): void {
    process.env.OIDC_ISSUER = OIDC_TEST_ISSUER;
    process.env.OIDC_REDIRECT_URI = OIDC_TEST_REDIRECT_URI;
    process.env.OIDC_POST_LOGOUT_REDIRECT_URI = OIDC_TEST_POST_LOGOUT_URI;
    process.env.OIDC_REGISTRATION_TOKEN = OIDC_TEST_REGISTRATION_TOKEN;
    process.env.OIDC_COOKIE_KEY = OIDC_TEST_COOKIE_KEY;
    process.env.OIDC_COOKIE_SECURE = 'false';
}

/**
 * Creates a test server instance preconfigured for OIDC interactive-flow tests.
 * The OIDC adapter is initialized in-memory so it never touches disk and
 * starts from a clean state. The OIDC-related environment variables are
 * temporarily overridden to point at the test port and a `restoreEnv` helper
 * is returned to undo the override.
 */
export async function setupOidcTestServer() {
    const envSnapshot = snapshotOidcEnv();
    applyOidcTestEnv();

    const storeFactory = await getTestStoreFactory();
    if (TEST_STORAGE_BACKEND === 'mongodb') {
        setOidcStoreFactory(storeFactory, path.join(os.tmpdir(), `docpouch-oidc-test-${process.pid}-${Date.now()}`), false);
    } else {
        initOidcDatabases(path.join(os.tmpdir(), `docpouch-oidc-test-${process.pid}-${Date.now()}`), true);
    }
    await clearAllOidcData();

    const dataManager = new DatabaseWrapper(testLogger, {inMemoryOnly: true}, {}, storeFactory);
    await dataManager.waitForInitialization();

    const emailService = new EmailService(null, testLogger, `http://localhost:${OIDC_TEST_PORT}`);
    dataManager.setEmailService(emailService);

    const corsOptions: I_CorsOption = {
        origin: `http://localhost:${OIDC_TEST_PORT}`,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Socket-ID']
    };
    const networkManager = new NetworkManager(testLogger, dataManager, OIDC_TEST_PORT, corsOptions, {}, emailService);
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
        networkManager,
        dataManager,
        server: networkManager.webServer,
        issuer: OIDC_TEST_ISSUER,
        clientId: OIDC_TEST_CLIENT_ID,
        redirectUri: OIDC_TEST_REDIRECT_URI,
        postLogoutRedirectUri: OIDC_TEST_POST_LOGOUT_URI,
        registrationToken: OIDC_TEST_REGISTRATION_TOKEN,
        restoreEnv: () => restoreOidcEnv(envSnapshot)
    };
}

/**
 * Wipes the OIDC state (sessions, grants, dynamic clients, etc.) without
 * tearing down the server. The static admin UI client is re-seeded by the
 * OIDC provider on the next call to `/api/oidc-client-config`.
 */
export async function cleanupOidcState(): Promise<void> {
    await clearAllOidcData();
}