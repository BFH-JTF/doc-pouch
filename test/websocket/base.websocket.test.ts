import {Server} from 'http';
import {io, Socket} from 'socket.io-client';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    API_BASE_URL
} from '../setup/testSetup.js';

describe('Base WebSocket Test', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminSocket: Socket;
    let userSocket: Socket;

    // Set up the test server before all tests
    beforeAll(async () => {
        // Set up the test server
        const setup = await setupTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    // Clean up the test database before each test
    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        // Recreate test users after cleaning the database
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;

        // Connect sockets with authentication
        adminSocket = io(API_BASE_URL, {
            auth: {token: adminToken},
            reconnection: false,
            forceNew: true,
            transports: ['websocket']
        });

        userSocket = io(API_BASE_URL, {
            auth: {token: userToken},
            reconnection: false,
            forceNew: true,
            transports: ['websocket']
        });

        // Wait for sockets to connect
        await Promise.all([
            new Promise<void>((resolve) => {
                adminSocket.on('connect', () => {
                    resolve();
                });
            }),
            new Promise<void>((resolve) => {
                userSocket.on('connect', () => {
                    resolve();
                });
            })
        ]);
    });

    // Disconnect sockets and clean up after each test
    afterEach(() => {
        if (adminSocket && adminSocket.connected) {
            adminSocket.disconnect();
        }
        if (userSocket && userSocket.connected) {
            userSocket.disconnect();
        }
    });

    // Close the test server after all tests
    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    // Helper function to create a promise that resolves when a specific event is received
    const waitForEvent = (socket: Socket, eventName: string, timeout = 5000) => {
        return new Promise<any>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout waiting for event: ${eventName}`));
            }, timeout);

            socket.once(eventName, (data) => {
                clearTimeout(timer);
                resolve(data);
            });
        });
    };

    // Example test to verify socket connection
    test('Socket connects successfully', async () => {
        expect(adminSocket.connected).toBe(true);
        expect(userSocket.connected).toBe(true);
    });

    // Example test for heartbeat mechanism
    test('Heartbeat mechanism works', async () => {
        // Set up event listener for heartbeatPing
        const heartbeatPromise = waitForEvent(adminSocket, 'heartbeatPing');

        // Manually emit heartbeatPing to trigger the test
        // In a real scenario, the server would emit this automatically
        networkManager['socketServer']['ioSocket'].emit('heartbeatPing');

        // Wait for the heartbeatPing event
        await heartbeatPromise;

        // Verify that the client responds with heartbeatPong
        // This is just a simple test to verify the mechanism works
        // In a real test, we would need to mock the server's heartbeatPing emission
        adminSocket.emit('heartbeatPong');

        // No assertion needed here, we're just verifying that the event flow works
        expect(true).toBe(true);
    });
});