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
import type {I_StructureCreation, I_StructureUpdate} from "docpouch-client";

describe('Structure WebSocket Events Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminSocket: Socket;
    let userSocket: Socket;
    let adminUser: any;
    let regularUser: any;

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

    describe('newStructure event', () => {
        test('should emit newStructure event to all users when a structure is created', async () => {
            // Set up event listeners
            const adminNewStructurePromise = waitForEvent(adminSocket, 'newStructure');
            const userNewStructurePromise = waitForEvent(userSocket, 'newStructure');

            // Create a new structure
            const newStructure: I_StructureCreation = {
                name: 'Test Structure',
                description: 'A test document structure',
                type: 1,
                subType: 1,
                fields: [
                    {
                        name: 'Field 1',
                        displayName: 'Field 1',
                        type: 'string'
                    },
                    {
                        name: 'Field 2',
                        displayName: 'Field 2',
                        type: 'number'
                    }
                ]
            };

            await authenticatedRequest(server, adminToken)
                .post('/structures/create')
                .send(newStructure);

            // Wait for the events
            const adminData = await adminNewStructurePromise;
            const userData = await userNewStructurePromise;

            // Verify the event data
            expect(adminData).toHaveProperty('newStructure');
            expect(adminData.newStructure).toHaveProperty('_id');
            expect(adminData.newStructure?.name).toBe(newStructure.name);
            expect(adminData.newStructure.description).toBe(newStructure.description);
            expect(adminData.newStructure.type).toBe(newStructure.type);
            expect(adminData.newStructure.subType).toBe(newStructure.subType);
            expect(adminData.newStructure.fields).toHaveLength(newStructure.fields.length);
            expect(adminData.newStructure.fields[0].name).toBe(newStructure.fields[0].name);
            expect(adminData.newStructure.fields[0].type).toBe(newStructure.fields[0].type);

            expect(userData).toHaveProperty('newStructure');
            expect(userData.newStructure).toHaveProperty('_id');
            expect(userData.newStructure?.name).toBe(newStructure.name);
            expect(userData.newStructure.description).toBe(newStructure.description);
            expect(userData.newStructure.type).toBe(newStructure.type);
            expect(userData.newStructure.subType).toBe(newStructure.subType);
            expect(userData.newStructure.fields).toHaveLength(newStructure.fields.length);
            expect(userData.newStructure.fields[0].name).toBe(newStructure.fields[0].name);
            expect(userData.newStructure.fields[0].type).toBe(newStructure.fields[0].type);
        });
    });

    describe('changedStructure event', () => {
        test('should emit changedStructure event to all users when a structure is updated', async () => {
            // Create a structure
            const newStructure: I_StructureCreation = {
                name: 'Structure to Update',
                description: 'A document structure to update',
                type: 2,
                subType: 1,
                fields: [
                    {
                        name: 'Original Field',
                        displayName: 'Original Field',
                        type: 'string'
                    }
                ]
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/structures/create')
                .send(newStructure);

            const structureId = createResponse.body._id;

            // Set up event listeners
            const adminChangedStructurePromise = waitForEvent(adminSocket, 'changedStructure');
            const userChangedStructurePromise = waitForEvent(userSocket, 'changedStructure');

            // Update the structure
            const updateData: I_StructureUpdate = {
                name: 'Updated Structure Title',
                description: 'Updated document structure',
                type: 2,
                subType: 2,
                fields: [
                    {
                        name: 'Updated Field',
                        displayName: 'Updated Field',
                        type: 'string'
                    },
                    {
                        name: 'New Field',
                        displayName: 'New Field',
                        type: 'boolean'
                    }
                ]
            };

            await authenticatedRequest(server, adminToken)
                .patch(`/structures/update/${structureId}`)
                .send(updateData);

            // Wait for the events
            const adminData = await adminChangedStructurePromise;
            const userData = await userChangedStructurePromise;

            // Verify the event data
            expect(adminData).toHaveProperty('changedStructure');
            expect(adminData.changedStructure._id).toBe(structureId);
            expect(adminData.changedStructure.name).toBe(updateData.name);
            expect(adminData.changedStructure.description).toBe(updateData.description);
            expect(adminData.changedStructure.type).toBe(updateData.type);
            expect(adminData.changedStructure.subType).toBe(updateData.subType);
            expect(adminData.changedStructure.fields).toHaveLength(updateData.fields.length);
            expect(adminData.changedStructure.fields[0].name).toBe(updateData.fields[0].name);
            expect(adminData.changedStructure.fields[1].name).toBe(updateData.fields[1].name);
            expect(adminData.changedStructure.fields[1].type).toBe(updateData.fields[1].type);

            expect(userData).toHaveProperty('changedStructure');
            expect(userData.changedStructure._id).toBe(structureId);
            expect(userData.changedStructure.name).toBe(updateData.name);
            expect(userData.changedStructure.description).toBe(updateData.description);
            expect(userData.changedStructure.type).toBe(updateData.type);
            expect(userData.changedStructure.subType).toBe(updateData.subType);
            expect(userData.changedStructure.fields).toHaveLength(updateData.fields.length);
            expect(userData.changedStructure.fields[0].name).toBe(updateData.fields[0].name);
            expect(userData.changedStructure.fields[1].name).toBe(updateData.fields[1].name);
            expect(userData.changedStructure.fields[1].type).toBe(updateData.fields[1].type);
        });
    });

    describe('removedStructure event', () => {
        test('should emit removedStructure event to all users when a structure is deleted', async () => {
            // Create a structure
            const newStructure: I_StructureCreation = {
                name: 'Structure to Delete',
                description: 'A document structure to delete',
                type: 3,
                subType: 1,
                fields: [
                    {
                        name: 'Field',
                        displayName: 'Field',
                        type: 'string'
                    }
                ]
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/structures/create')
                .send(newStructure);

            const structureId = createResponse.body._id;

            // Set up event listeners
            const adminRemovedStructurePromise = waitForEvent(adminSocket, 'removedStructure');
            const userRemovedStructurePromise = waitForEvent(userSocket, 'removedStructure');

            // Delete the structure
            await authenticatedRequest(server, adminToken)
                .delete(`/structures/remove/${structureId}`);

            // Wait for the events
            const adminData = await adminRemovedStructurePromise;
            const userData = await userRemovedStructurePromise;

            // Verify the event data
            expect(adminData).toHaveProperty('removedID');
            expect(adminData.removedID).toBe(structureId);

            expect(userData).toHaveProperty('removedID');
            expect(userData.removedID).toBe(structureId);
        });
    });

    describe('Structure events with multiple clients', () => {
        test('should emit structure events to all connected clients', async () => {
            // Create a third user
            const thirdUser = {
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
            const adminNewStructurePromise = waitForEvent(adminSocket, 'newStructure');
            const userNewStructurePromise = waitForEvent(userSocket, 'newStructure');
            const thirdUserNewStructurePromise = waitForEvent(thirdUserSocket, 'newStructure');

            // Create a new structure
            const newStructure: I_StructureCreation = {
                name: 'Multi-Client Test Structure',
                description: 'A multi-client document structure',
                type: 4,
                subType: 1,
                fields: [
                    {
                        name: 'Field',
                        displayName: 'Field',
                        type: 'string'
                    }
                ]
            };

            await authenticatedRequest(server, adminToken)
                .post('/structures/create')
                .send(newStructure);

            // Wait for the events
            const adminData = await adminNewStructurePromise;
            const userData = await userNewStructurePromise;
            const thirdUserData = await thirdUserNewStructurePromise;

            // Disconnect third user socket
            if (thirdUserSocket && thirdUserSocket.connected) {
                thirdUserSocket.disconnect();
            }

            // Verify all clients received the event
            expect(adminData).toHaveProperty('newStructure');
            expect(adminData.newStructure?.name).toBe(newStructure.name);

            expect(userData).toHaveProperty('newStructure');
            expect(userData.newStructure.name).toBe(newStructure.name);

            expect(thirdUserData).toHaveProperty('newStructure');
            expect(thirdUserData.newStructure.name).toBe(newStructure.name);
        });
    });
});
