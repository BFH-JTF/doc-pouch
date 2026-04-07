import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import winston from 'winston';
import type {I_UserCreation, I_UserEntry, I_WsMessage} from 'docpouch-client';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import request from "supertest";
import type {Socket} from "socket.io-client";

const testLogger = winston.createLogger({
    level: 'error',
    transports: [
        new winston.transports.File({filename: path.join('log', 'test.log')})
    ]
});

if (!fs.existsSync('log')) {
    fs.mkdirSync('log', {recursive: true});
}

const TEST_PORT = 3031;

/**
 * Creates a test server instance
 * @returns {Promise<{networkManager: NetworkManager, dataManager: NeDbWrapper, server: Server}>}
 */
export async function setupTestServer() {
    const dataManager = new NeDbWrapper(testLogger, {inMemoryOnly: true});

    // Let NetworkManager create and listen on its own server instance
    const corsOptions = {
        origin: "*",
        credentials: true
    };
    const networkManager = new NetworkManager(testLogger, dataManager, TEST_PORT, corsOptions);

    // Wait briefly to let the server start
    await new Promise(resolve => setTimeout(resolve, 100));
    // Return the server that NetworkManager created
    return {networkManager, dataManager, server: networkManager.webServer};
}

// Secret key for JWT generation (this should match what's in your actual app)
const JWT_SECRET = 'ThisIsMyVeryOwnAndCreativeSecret';

/**
 * Creates test users for testing
 * @param {NeDbWrapper} dataManager - The database manager
 * @returns {Promise<{adminUser: any, regularUser: any, adminToken: string, userToken: string}>}
 */
export async function createTestUsers(dataManager: NeDbWrapper) {
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
 * @param {NeDbWrapper} dataManager - The database manager
 */
export async function cleanupTestDatabase(dataManager: NeDbWrapper) {
    // Remove all records from NeDB collections
    await dataManager.users.remove({});
    await dataManager.documents.remove({});
    await dataManager.structures.remove({});
    await dataManager.types.remove({});
}

export const authenticatedRequest = (server: Server, token: string) => {
    return {
        get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${token}`),
        post: (url: string, body?: any) => request(server).post(url).set('Authorization', `Bearer ${token}`).send(body),
        patch: (url: string, body?: any) => request(server).patch(url).set('Authorization', `Bearer ${token}`).send(body),
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