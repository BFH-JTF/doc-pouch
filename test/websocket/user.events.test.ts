import {Server} from 'http';
import {io, Socket} from 'socket.io-client';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    API_BASE_URL, waitForEvent, authenticatedRequest
} from '../setup/testSetup.js';
import request from 'supertest';
import type {I_UserCreation, I_UserUpdate} from 'docpouch-client';

describe('User WebSocket Events Tests', () => {
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
        await closeTestServer(server);
    });

    describe('newUser event', () => {
        test('should emit newUser event to admin users when a user is created', async () => {
            // Set up event listener for admin
            const adminNewUserPromise = waitForEvent(adminSocket, 'newUser');

            // For regular user, we expect no event, so we'll use a timeout
            const userNewUserPromise = new Promise<boolean>((resolve) => {
                userSocket.once('newUser', () => {
                    resolve(true); // Event was received (unexpected)
                });

                setTimeout(() => {
                    resolve(false); // No event received (expected)
                }, 2000);
            });

            // Create a new user
            const newUser: I_UserCreation = {
                name: 'New Test User',
                password: 'password123',
                email: 'newuser@example.com',
                department: 'Testing',
                group: 'Testers',
                isAdmin: false
            };

            await authenticatedRequest(server, adminToken)
                .post('/users/create')
                .send(newUser);

            // Wait for the events
            const adminData = await adminNewUserPromise;
            const userReceivedEvent = await userNewUserPromise;

            // Verify the event data
            expect(adminData).toHaveProperty('newUser');
            expect(adminData.newUser).toHaveProperty('_id');
            expect(adminData.newUser?.name).toBe(newUser.name);
            expect(adminData.newUser?.email).toBe(newUser.email);
            expect(adminData.newUser?.department).toBe(newUser.department);
            expect(adminData.newUser?.group).toBe(newUser.group);

            // Regular user should not receive the event
            expect(userReceivedEvent).toBe(false);
        });
    });

    describe('changedUser event', () => {
        test('should emit changedUser event to admin users when a user is updated', async () => {
            // Set up event listener for admin
            const adminChangedUserPromise = waitForEvent(adminSocket, 'changedUser');

            // For regular user, we expect no event, so we'll use a timeout
            const userChangedUserPromise = new Promise<boolean>((resolve) => {
                userSocket.once('changedUser', () => {
                    resolve(true); // Event was received (unexpected)
                });

                setTimeout(() => {
                    resolve(false); // No event received (expected)
                }, 2000);
            });

            // Update a user
            const updateData: I_UserUpdate = {
                name: 'Updated User Name',
                email: 'updated@example.com',
                department: 'Updated Department',
                group: 'Updated Group'
            };

            await authenticatedRequest(server, adminToken)
                .patch(`/users/update/${regularUser._id}`)
                .send(updateData);

            // Wait for the events
            const adminData = await adminChangedUserPromise;
            const userReceivedEvent = await userChangedUserPromise;

            // Verify the event data
            expect(adminData).toHaveProperty('changedUser');
            expect(adminData.changedUser?._id).toBe(regularUser._id);
            expect(adminData.changedUser?.name).toBe(updateData.name);
            expect(adminData.changedUser?.email).toBe(updateData.email);
            expect(adminData.changedUser?.department).toBe(updateData.department);
            expect(adminData.changedUser?.group).toBe(updateData.group);

            // Regular user should not receive the event
            expect(userReceivedEvent).toBe(false);
        });

        test('should emit changedUser event to admin users when a user updates themselves', async () => {
            // Set up event listener for admin
            const adminChangedUserPromise = waitForEvent(adminSocket, 'changedUser');

            // For regular user, we expect no event, so we'll use a timeout
            const userChangedUserPromise = new Promise<boolean>((resolve) => {
                userSocket.once('changedUser', () => {
                    resolve(true); // Event was received (unexpected)
                });

                setTimeout(() => {
                    resolve(false); // No event received (expected)
                }, 2000);
            });

            // User updates themselves
            const updateData = {
                name: 'Self Updated Name',
                email: 'selfupdated@example.com'
            };

            await authenticatedRequest(server, userToken)
                .patch(`/users/update/${regularUser._id}`)
                .send(updateData);

            // Wait for the events
            const adminData = await adminChangedUserPromise;
            const userReceivedEvent = await userChangedUserPromise;

            // Verify the event data
            expect(adminData).toHaveProperty('changedUser');
            expect(adminData.changedUser?._id).toBe(regularUser._id);
            expect(adminData.changedUser?.name).toBe(updateData.name);
            expect(adminData.changedUser?.email).toBe(updateData.email);

            // Regular user should not receive the event
            expect(userReceivedEvent).toBe(false);
        });
    });

    describe('removedUser event', () => {
        test('should emit removedUser event to admin users when a user is deleted', async () => {
            // Create a user to delete
            const userToDelete: I_UserCreation = {
                name: 'User To Delete',
                password: 'password123',
                email: 'delete@example.com',
                department: 'Deletion',
                group: 'ToDelete',
                isAdmin: false
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/users/create')
                .send(userToDelete);

            const userToDeleteId = createResponse.body._id;

            // Set up event listener for admin
            const adminRemovedUserPromise = waitForEvent(adminSocket, 'removedUser');

            // For regular user, we expect no event, so we'll use a timeout
            const userRemovedUserPromise = new Promise<boolean>((resolve) => {
                userSocket.once('removedUser', () => {
                    resolve(true); // Event was received (unexpected)
                });

                setTimeout(() => {
                    resolve(false); // No event received (expected)
                }, 2000);
            });

            // Delete the user
            await authenticatedRequest(server, adminToken)
                .delete(`/users/remove/${userToDeleteId}`);

            // Wait for the events
            const adminData = await adminRemovedUserPromise;
            const userReceivedEvent = await userRemovedUserPromise;

            // Verify the event data
            expect(adminData).toHaveProperty('removedID');
            expect(adminData.removedID).toBe(userToDeleteId);

            // Regular user should not receive the event
            expect(userReceivedEvent).toBe(false);
        });
    });

    describe('Admin user events', () => {
        test('should emit user events to newly created admin users', async () => {
            // Create a new admin user
            const newAdminUser: I_UserCreation = {
                name: 'New Admin User',
                password: 'adminpassword',
                email: 'newadmin@example.com',
                department: 'Admin',
                group: 'Admins',
                isAdmin: true
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/users/create')
                .send(newAdminUser);

            const newAdminId = createResponse.body._id;

            // Get token for new admin
            const loginResponse = await request(server)
                .post('/users/login')
                .send({
                    name: 'New Admin User',
                    password: 'adminpassword'
                });

            const newAdminToken = loginResponse.body.token;

            // Connect socket for new admin
            const newAdminSocket = io(API_BASE_URL, {
                auth: {token: newAdminToken},
                reconnection: false,
                forceNew: true,
                transports: ['websocket']
            });

            await new Promise<void>((resolve) => {
                newAdminSocket.on('connect', () => {
                    resolve();
                });
            });

            // Set up event listeners
            const adminNewUserPromise = waitForEvent(adminSocket, 'newUser');
            const newAdminNewUserPromise = waitForEvent(newAdminSocket, 'newUser');

            // Create another user
            const anotherUser: I_UserCreation = {
                name: 'Another Test User',
                password: 'password123',
                email: 'another@example.com',
                department: 'Testing',
                group: 'Testers',
                isAdmin: false
            };

            await authenticatedRequest(server, adminToken)
                .post('/users/create')
                .send(anotherUser);

            // Wait for the events
            const adminData = await adminNewUserPromise;
            const newAdminData = await newAdminNewUserPromise;

            // Disconnect new admin socket
            if (newAdminSocket && newAdminSocket.connected) {
                newAdminSocket.disconnect();
            }

            // Verify both admins received the event
            expect(adminData).toHaveProperty('newUser');
            expect(adminData.newUser?.name).toBe(anotherUser.name);

            expect(newAdminData).toHaveProperty('newUser');
            expect(newAdminData.newUser?.name).toBe(anotherUser.name);
        });
    });
});