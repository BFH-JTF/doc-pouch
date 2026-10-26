import {Server} from 'http';
import {io, Socket} from 'socket.io-client';
import jwt from 'jsonwebtoken';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    API_BASE_URL,
    waitForEvent,
} from '../setup/testSetup.js';

// Regression tests for #116: a demoted super-admin must stop receiving
// admin-broadcast WebSocket events immediately, not only after their
// socket happens to reconnect.

function connectSocket(token: string): Promise<Socket> {
    const socket = io(API_BASE_URL, {
        auth: {token},
        reconnection: false,
        forceNew: true,
        transports: ['websocket']
    });
    return new Promise((resolve, reject) => {
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', (err: Error) => reject(err));
    });
}

function expectNoEvent(socket: Socket, event: string, windowMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            socket.off(event, onEvent);
            resolve(false); // no event within the window — expected
        }, windowMs);
        const onEvent = () => {
            clearTimeout(timer);
            resolve(true); // unexpected event received
        };
        socket.once(event, onEvent);
    });
}

describe('WebSocket admin privilege re-evaluation (#116)', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminUser: any;
    let adminToken: string;
    let secondAdminToken: string;
    let adminSocket: Socket;
    let secondAdminSocket: Socket;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminUser = users.adminUser;
        adminToken = users.adminToken;

        // A second super-admin whose privileges stay intact.
        const secondAdmin = await dataManager.createUser({
            name: 'admin2',
            password: 'admin2password',
            email: 'admin2@example.com',
            department: 'IT',
            group: 'Admins',
            isAdmin: true,
        });
        secondAdminToken = jwt.sign({id: secondAdmin._id}, process.env.JWT_SECRET as string, {algorithm: 'HS512', expiresIn: '1h', issuer: 'DocPouch'});

        adminSocket = await connectSocket(adminToken);
        secondAdminSocket = await connectSocket(secondAdminToken);
    });

    afterEach(() => {
        if (adminSocket?.connected) adminSocket.disconnect();
        if (secondAdminSocket?.connected) secondAdminSocket.disconnect();
    });

    test('both admins receive the broadcast while they hold the privilege', async () => {
        const received = [
            waitForEvent(adminSocket, 'newUser'),
            waitForEvent(secondAdminSocket, 'newUser'),
        ];
        await networkManager.socketServer.sendEventToAdmins(undefined, 'newUser', {newUser: {name: 'sanity'}} as any);
        await Promise.all(received);
    });

    test('a demoted admin stops receiving admin broadcasts without reconnecting', async () => {
        // Positive control first: the admin receives events before demotion.
        const beforeDemotion = waitForEvent(adminSocket, 'newUser');
        await networkManager.socketServer.sendEventToAdmins(undefined, 'newUser', {newUser: {name: 'before'}} as any);
        await beforeDemotion;

        // Demote the first admin in the database.
        await dataManager.updateUser(adminUser._id, {isAdmin: false});

        // Broadcast again. Only the still-admin socket may receive it.
        const stillAdminReceives = waitForEvent(secondAdminSocket, 'newUser');
        await networkManager.socketServer.sendEventToAdmins(undefined, 'newUser', {newUser: {name: 'after'}} as any);
        await stillAdminReceives;

        const demotedReceived = await expectNoEvent(adminSocket, 'newUser', 1000);
        expect(demotedReceived).toBe(false);
    });

    test('a deleted admin no longer receives admin broadcasts', async () => {
        await dataManager.removeUser(adminUser._id);

        const stillAdminReceives = waitForEvent(secondAdminSocket, 'newUser');
        await networkManager.socketServer.sendEventToAdmins(undefined, 'newUser', {newUser: {name: 'post-delete'}} as any);
        await stillAdminReceives;

        const removedReceived = await expectNoEvent(adminSocket, 'newUser', 1000);
        expect(removedReceived).toBe(false);
    });
});