import {io, Socket} from 'socket.io-client';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    API_BASE_URL,
    waitForEvent
} from '../setup/testSetup.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';

describe('Socket Consistency Check Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let adminUser: any;
    let socket: Socket;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        dataManager = setup.dataManager;
        networkManager = setup.networkManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        adminUser = users.adminUser;
    });

    afterEach(() => {
        if (socket && socket.connected) {
            socket.disconnect();
        }
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('admin should receive databaseInconsistency event on connection if faulty docs exist', async () => {
        // Create a faulty document (invalid owner)
        await dataManager.documents.add({
            title: 'Faulty Document',
            owner: 'non-existent-owner-id',
            type: 1,
            subType: 1,
            public: false,
            content: {text: 'Faulty'}
        });

        // Add the structure classification so only the owner is faulty.
        await dataManager.structures.add({
            name: 'Structure 1-1',
            description: 'Structure classification for consistency checks',
            type: 1,
            subType: 1,
            fields: []
        });

        // Connect socket with admin token
        socket = io(API_BASE_URL, {
            auth: {
                token: adminToken
            }
        });

        // Wait for databaseInconsistency event
        const eventData: any = await waitForEvent(socket, 'databaseInconsistency');

        expect(eventData).toBeDefined();
        expect(eventData.faultyDocuments).toBeDefined();
        expect(Array.isArray(eventData.faultyDocuments)).toBe(true);
        expect(eventData.faultyDocuments.length).toBeGreaterThan(0);
        expect(eventData.faultyDocuments[0].title).toBe('Faulty Document');
    });

    test('admin should NOT receive databaseInconsistency event if no faulty docs exist', async () => {
        // Create a valid document
        await dataManager.documents.add({
            title: 'Valid Document',
            owner: adminUser._id,
            type: 1,
            subType: 1,
            public: false,
            content: {text: 'Valid'}
        });
        await dataManager.structures.add({
            name: 'Structure 1-1',
            description: 'Structure classification for consistency checks',
            type: 1,
            subType: 1,
            fields: []
        });

        // Connect socket with admin token
        socket = io(API_BASE_URL, {
            auth: {
                token: adminToken
            }
        });

        // We expect NO event, so waitForEvent should timeout
        // Using a shorter timeout for the negative case
        try {
            await waitForEvent(socket, 'databaseInconsistency', 1000);
            fail('Should not have received databaseInconsistency event');
        } catch (error: any) {
            expect(error.message).toContain('Timeout');
        }
    });
});
