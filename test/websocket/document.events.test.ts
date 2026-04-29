import {Server} from 'http';
import {io, Socket} from 'socket.io-client';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    API_BASE_URL, authenticatedRequest, waitForEvent, generateToken
} from '../setup/testSetup.js';
import type {I_DocumentCreation, I_UserCreation, I_UserEntry} from "docpouch-client";

describe('Document WebSocket Events Tests', () => {
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

        // Create required document structures
        for (let i = 1; i <= 6; i++) {
            await dataManager.structures.add({
                type: i,
                subType: i,
                name: `Type ${i}-${i}`,
                description: 'Test structure',
                fields: []
            });
        }

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


    describe('newDocument event', () => {
        test('should emit newDocument event when a document is created', async () => {
            // Set up event listeners
            const adminNewDocPromise = waitForEvent(adminSocket, 'newDocument');
            const userNewDocPromise = waitForEvent(userSocket, 'newDocument');

            // Create a new document
            const newDocument: I_DocumentCreation = {
                title: 'WebSocket Test Document',
                type: 1,
                subType: 1,
                public: false,
                content: {text: 'This is a test document for WebSocket events'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            // Wait for the event to be received
            const adminData = await adminNewDocPromise;
            const userData = await userNewDocPromise;

            // Verify the event data
            expect(adminData).toHaveProperty('newDocument');
            expect(adminData.newDocument).toHaveProperty('_id');
            expect(adminData.newDocument?.title).toBe(newDocument.title);
            expect(adminData.newDocument?.content).toEqual(newDocument.content);

            expect(userData).toHaveProperty('newDocument');
            expect(userData.newDocument).toHaveProperty('_id');
            expect(userData.newDocument?.title).toBe(newDocument.title);
            expect(userData.newDocument?.content).toEqual(newDocument.content);
        });

        test('should emit newDocument event only to users with access when document is shared with group', async () => {
            // Create a third user in a different group
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
            const adminNewDocPromise = waitForEvent(adminSocket, 'newDocument');
            const userNewDocPromise = waitForEvent(userSocket, 'newDocument');

            // For the third user, we expect no event, so we'll use a timeout
            const thirdUserNewDocPromise = new Promise<boolean>((resolve) => {
                thirdUserSocket.once('newDocument', () => {
                    resolve(true); // Event was received (unexpected)
                });

                setTimeout(() => {
                    resolve(false); // No event received (expected)
                }, 2000);
            });

            // Create a new document shared with the user's group
            const newDocument: I_DocumentCreation = {
                title: 'Group Shared Document',
                type: 2,
                subType: 2,
                public: false,
                content: {text: 'This document is shared with the group'},
                shareWithGroup: true,
                shareWithDepartment: false
            };

            await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            // Wait for the events
            const adminData = await adminNewDocPromise;
            const userData = await userNewDocPromise;
            const thirdUserReceivedEvent = await thirdUserNewDocPromise;

            // Disconnect third user socket
            if (thirdUserSocket && thirdUserSocket.connected) {
                thirdUserSocket.disconnect();
            }

            // Verify the event data
            expect(adminData).toHaveProperty('newDocument');
            expect(adminData.newDocument?.shareWithGroup).toBe(true);

            expect(userData).toHaveProperty('newDocument');
            expect(userData.newDocument?.shareWithGroup).toBe(true);

            // Third user should not receive the event
            expect(thirdUserReceivedEvent).toBe(false);
        });
    });

    describe('changedDocument event', () => {
        test('should emit changedDocument event when a document is updated', async () => {
            // Create a document
            const newDocument: I_DocumentCreation = {
                title: 'Document to Update',
                type: 3,
                subType: 3,
                public: false,
                content: {text: 'This document will be updated'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const createResponse = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            const documentId = createResponse.body._id;

            // Set up event listeners
            const adminChangedDocPromise = waitForEvent(adminSocket, 'changedDocument');
            const userChangedDocPromise = waitForEvent(userSocket, 'changedDocument');

            // Update the document
            const updateData = {
                title: 'Updated Document Title',
                content: {text: 'This document has been updated'}
            };

            await authenticatedRequest(server, userToken)
                .patch(`/docs/update/${documentId}`)
                .send(updateData);

            // Wait for the event to be received
            const adminData = await adminChangedDocPromise;
            const userData = await userChangedDocPromise;

            // Verify the event data
            expect(adminData).toHaveProperty('changedDocument');
            expect(adminData.changedDocument?._id).toBe(documentId);
            expect(adminData.changedDocument?.title).toBe(updateData.title);
            expect(adminData.changedDocument?.content).toStrictEqual(updateData.content);

            expect(userData).toHaveProperty('changedDocument');
            expect(userData.changedDocument?._id).toBe(documentId);
            expect(userData.changedDocument?.title).toBe(updateData.title);
            expect(userData.changedDocument?.content).toStrictEqual(updateData.content);
        });

        test('should emit changedDocument event only to users with access when document is updated', async () => {
            // Create a third user in a different group
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

            // Create a document
            const newDocument: I_DocumentCreation = {
                title: 'Private Document to Update',
                type: 4,
                subType: 4,
                public: false,
                content: {text: 'This private document will be updated'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const createResponse = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            const documentId = createResponse.body._id;

            // Set up event listeners
            const adminChangedDocPromise = waitForEvent(adminSocket, 'changedDocument');
            const userChangedDocPromise = waitForEvent(userSocket, 'changedDocument');

            // For the third user, we expect no event, so we'll use a timeout
            const thirdUserChangedDocPromise = new Promise<boolean>((resolve) => {
                thirdUserSocket.once('changedDocument', () => {
                    resolve(true); // Event was received (unexpected)
                });

                setTimeout(() => {
                    resolve(false); // No event received (expected)
                }, 2000);
            });

            // Update the document
            const updateData = {
                title: 'Updated Private Document',
                content: {text: 'This private document has been updated'}
            };

            await authenticatedRequest(server, userToken)
                .patch(`/docs/update/${documentId}`)
                .send(updateData);

            // Wait for the events
            const adminData = await adminChangedDocPromise;
            const userData = await userChangedDocPromise;
            const thirdUserReceivedEvent = await thirdUserChangedDocPromise;

            // Disconnect third user socket
            if (thirdUserSocket && thirdUserSocket.connected) {
                thirdUserSocket.disconnect();
            }

            // Verify the event data
            expect(adminData).toHaveProperty('changedDocument');
            expect(adminData.changedDocument).toHaveProperty('_id');
            expect(adminData.changedDocument?._id).toBe(documentId);

            expect(userData).toHaveProperty('changedDocument');
            expect(adminData.changedDocument).toHaveProperty('_id');
            expect(userData.changedDocument?._id).toBe(documentId);

            // Third user should not receive the event
            expect(thirdUserReceivedEvent).toBe(false);
        });
    });

    describe('removedDocument event', () => {
        test('should emit removedDocument event when a document is deleted', async () => {
            // Create a document
            const newDocument: I_DocumentCreation = {
                title: 'Document to Delete',
                type: 5,
                subType: 5,
                public: false,
                content: {text: 'This document will be deleted'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const createResponse = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            const documentId = createResponse.body._id;

            // Set up event listeners
            const adminRemovedDocPromise = waitForEvent(adminSocket, 'removedDocument');
            const userRemovedDocPromise = waitForEvent(userSocket, 'removedDocument');

            // Delete the document
            await authenticatedRequest(server, userToken)
                .delete(`/docs/remove/${documentId}`);

            // Wait for the event to be received
            const adminData = await adminRemovedDocPromise;
            const userData = await userRemovedDocPromise;

            // Verify the event data
            expect(adminData).toHaveProperty('removedID');
            expect(adminData.removedID).toBe(documentId);

            expect(userData).toHaveProperty('removedID');
            expect(userData.removedID).toBe(documentId);
        });

        test('should emit removedDocument event only to users with access when document is deleted', async () => {
            // Create a third user in a different group
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

            // Create a document
            const newDocument: I_DocumentCreation = {
                title: 'Private Document to Delete',
                type: 6,
                subType: 6,
                public: false,
                content: {text: 'This private document will be deleted'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const createResponse = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            const documentId = createResponse.body._id;

            // Set up event listeners
            const adminRemovedDocPromise = waitForEvent(adminSocket, 'removedDocument');
            const userRemovedDocPromise = waitForEvent(userSocket, 'removedDocument');

            // For the third user, we expect no event, so we'll use a timeout
            const thirdUserRemovedDocPromise = new Promise<boolean>((resolve) => {
                thirdUserSocket.once('removedDocument', () => {
                    resolve(true); // Event was received (unexpected)
                });

                setTimeout(() => {
                    resolve(false); // No event received (expected)
                }, 2000);
            });

            // Delete the document
            await authenticatedRequest(server, userToken)
                .delete(`/docs/remove/${documentId}`);

            // Wait for the events
            const adminData = await adminRemovedDocPromise;
            const userData = await userRemovedDocPromise;
            const thirdUserReceivedEvent = await thirdUserRemovedDocPromise;

            // Disconnect third user socket
            if (thirdUserSocket && thirdUserSocket.connected) {
                thirdUserSocket.disconnect();
            }

            // Verify the event data
            expect(adminData).toHaveProperty('removedID');
            expect(adminData.removedID).toBe(documentId);

            expect(userData).toHaveProperty('removedID');
            expect(userData.removedID).toBe(documentId);

            // Third user should not receive the event
            expect(thirdUserReceivedEvent).toBe(false);
        });
    });
});