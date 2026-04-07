import {Server} from 'http';
import {io, Socket} from 'socket.io-client';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    API_BASE_URL, waitForEvent, authenticatedRequest, generateToken
} from '../setup/testSetup.js';
import request from 'supertest';
import type {I_DocumentType, I_StructureCreation, I_UserCreation} from "docpouch-client";

describe('Document Type WebSocket Events Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminSocket: Socket;
    let userSocket: Socket;
    let adminUser: any;
    let regularUser: any;
    let testStructureId: string;

    // Set up the test server before all tests
    beforeAll(async () => {
        // Set up the test server
        const setup = await setupTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    // Clean up the test database and set up sockets before each test
    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        // Create test users
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;
        adminUser = users.adminUser;
        regularUser = users.regularUser;

        // Create a test data structure
        const testStructure: I_StructureCreation = {
            name: 'Test Structure',
            fields: [
                {
                    name: 'Field 1',
                    type: 'string'
                },
                {
                    name: 'Field 2',
                    type: 'number'
                }
            ]
        };

        const structureResponse = await authenticatedRequest(server, adminToken)
            .post('/structures/create')
            .send(testStructure);

        testStructureId = structureResponse.body._id;

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

    describe('newType event', () => {
        test('should emit newType event to all users when a document type is created', async () => {
            // Set up event listeners
            const adminNewTypePromise = waitForEvent(adminSocket, 'newType');
            const userNewTypePromise = waitForEvent(userSocket, 'newType');

            // Create a new document type
            const newType = {
                name: 'Test Document Type',
                description: 'A test document type for testing',
                type: 1,
                subType: 1,
                defaultStructureID: testStructureId
            };

            await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(newType);

            // Wait for the events
            const adminData = await adminNewTypePromise;
            const userData = await userNewTypePromise;

            // Verify the event data
            expect(adminData).toHaveProperty('newType');
            expect(adminData.newType).toHaveProperty('_id');
            expect(adminData.newType.name).toBe(newType.name);
            expect(adminData.newType.description).toBe(newType.description);
            expect(adminData.newType.type).toBe(newType.type);
            expect(adminData.newType.subType).toBe(newType.subType);
            expect(adminData.newType.defaultStructureID).toBe(newType.defaultStructureID);

            expect(userData).toHaveProperty('newType');
            expect(userData.newType).toHaveProperty('_id');
            expect(userData.newType.name).toBe(newType.name);
            expect(userData.newType.description).toBe(newType.description);
            expect(userData.newType.type).toBe(newType.type);
            expect(userData.newType.subType).toBe(newType.subType);
            expect(userData.newType.defaultStructureID).toBe(newType.defaultStructureID);
        });

        test('should emit newType event when updating an existing document type', async () => {
            // Create a document type
            const initialType: I_DocumentType = {
                name: 'Initial Document Type',
                description: 'An initial document type',
                type: 2,
                subType: 2,
                defaultStructureID: testStructureId
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(initialType);

            const typeId = createResponse.body._id;

            // Set up event listeners
            const adminNewTypePromise = waitForEvent(adminSocket, 'newType');
            const userNewTypePromise = waitForEvent(userSocket, 'newType');

            // Update the document type
            const updatedType = {
                _id: typeId,
                name: 'Updated Document Type',
                description: 'An updated document type',
                type: 2,
                subType: 2,
                defaultStructureID: testStructureId
            };

            await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(updatedType);

            // Wait for the events
            const adminData = await adminNewTypePromise;
            const userData = await userNewTypePromise;

            // Verify the event data
            expect(adminData).toHaveProperty('newType');
            expect(adminData.newType._id).toBe(typeId);
            expect(adminData.newType.name).toBe(updatedType.name);
            expect(adminData.newType.description).toBe(updatedType.description);

            expect(userData).toHaveProperty('newType');
            expect(userData.newType._id).toBe(typeId);
            expect(userData.newType.name).toBe(updatedType.name);
            expect(userData.newType.description).toBe(updatedType.description);
        });
    });

    describe('removedType event', () => {
        test('should emit removedType event to all users when a document type is deleted', async () => {
            // Create a document type
            const newType: I_DocumentType = {
                name: 'Document Type to Delete',
                description: 'A document type that will be deleted',
                type: 3,
                subType: 3,
                defaultStructureID: testStructureId
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(newType);

            const typeId = createResponse.body._id;

            // Set up event listeners
            const adminRemovedTypePromise = waitForEvent(adminSocket, 'removedType');
            const userRemovedTypePromise = waitForEvent(userSocket, 'removedType');

            // Delete the document type
            await authenticatedRequest(server, adminToken)
                .delete(`/types/remove/${typeId}`);

            // Wait for the events
            const adminData = await adminRemovedTypePromise;
            const userData = await userRemovedTypePromise;

            // Verify the event data
            expect(adminData).toHaveProperty('removedID');
            expect(adminData.removedID).toBe(typeId);

            expect(userData).toHaveProperty('removedID');
            expect(userData.removedID).toBe(typeId);
        });
    });

    describe('Type events with multiple clients', () => {
        test('should emit type events to all connected clients', async () => {
            // Create a third user
            const thirdUser: I_UserCreation = {
                name: 'thirduser',
                password: 'password',
                email: 'third@example.com',
                department: 'Different',
                group: 'DifferentGroup',
                isAdmin: false
            };

            const createdThirdUser = await dataManager.createUser(thirdUser);
            const thirdUserToken = generateToken(createdThirdUser);

            // Connect socket for third user
            const thirdUserSocket = io(API_BASE_URL, {
                auth: {token: thirdUserToken},
                reconnection: false,
                forceNew: true,
                transports: ['websocket']
            });

            await new Promise<void>((resolve) => {
                thirdUserSocket.on('connect', () => {
                    resolve();
                });
            });

            // Set up event listeners
            const adminNewTypePromise = waitForEvent(adminSocket, 'newType');
            const userNewTypePromise = waitForEvent(userSocket, 'newType');
            const thirdUserNewTypePromise = waitForEvent(thirdUserSocket, 'newType');

            // Create a new document type
            const newType: I_DocumentType = {
                name: 'Multi-Client Test Type',
                description: 'A test type for multiple clients',
                type: 4,
                subType: 4,
                defaultStructureID: testStructureId
            };

            await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(newType);

            // Wait for the events
            const adminData = await adminNewTypePromise;
            const userData = await userNewTypePromise;
            const thirdUserData = await thirdUserNewTypePromise;

            // Disconnect third user socket
            if (thirdUserSocket && thirdUserSocket.connected) {
                thirdUserSocket.disconnect();
            }

            // Verify all clients received the event
            expect(adminData).toHaveProperty('newType');
            expect(adminData.newType.name).toBe(newType.name);

            expect(userData).toHaveProperty('newType');
            expect(userData.newType.name).toBe(newType.name);

            expect(thirdUserData).toHaveProperty('newType');
            expect(thirdUserData.newType.name).toBe(newType.name);
        });
    });
});