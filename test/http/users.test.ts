import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    API_BASE_URL, authenticatedRequest
} from '../setup/testSetup.js';
import type {I_UserCreation, I_UserEntry, I_UserUpdate} from 'docpouch-client';

describe('User Management API Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminUser: I_UserEntry;
    let regularUser: I_UserEntry;

    beforeAll(async () => {
        // Set up the test server
        const setup = await setupTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        // Create test users
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;
        adminUser = users.adminUser;
        regularUser = users.regularUser;
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    describe('/users/list', () => {
        test('admin should get a list of all users', async () => {
            const response = await authenticatedRequest(server, adminToken).get('/users/list');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(2); // At least admin and regular user

            // Check that user properties are returned correctly
            const userInResponse = response.body.find((user: any) => user._id === regularUser._id);
            expect(userInResponse).toBeDefined();
            expect(userInResponse.name).toBe(regularUser.name);
            expect(userInResponse.email).toBe(regularUser.email);
            expect(userInResponse.department).toBe(regularUser.department);
            expect(userInResponse.group).toBe(regularUser.group);
        });

        test('regular user should only get their own user information', async () => {
            const response = await authenticatedRequest(server, userToken).get('/users/list');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(1); // Only their own data
            expect(response.body[0]._id).toBe(regularUser._id);
        });
    });

    describe('/users/login', () => {
        test('should authenticate a valid user and return a token', async () => {
            const response = await request(server)
                .post('/users/login')
                .send({
                    name: 'admin',
                    password: 'adminpassword'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(typeof response.body.token).toBe('string');
        });

        test('should return 401 for invalid credentials', async () => {
            const response = await request(server)
                .post('/users/login')
                .send({
                    name: 'admin',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
        });

        test('invalid request should return 404', async () => {
            const response = await request(server).get('/users/login');
            expect(response.status).toBe(404);
        });

        test('should return 404 for non-existent user', async () => {
            const response = await request(server)
                .post('/users/login')
                .send({
                    name: 'nonexistentuser',
                    password: 'password'
                });

            expect(response.status).toBe(404);
        });
    });


    describe('PATCH /users/update/{userID}', () => {
        test('admin should be able to update any user', async () => {
            const updateData: I_UserUpdate = {
                name: 'Updated User Name',
                email: 'updated@example.com',
                department: 'Updated Department',
                group: 'Updated Group'
            };

            const response = await authenticatedRequest(server, adminToken)
                .patch(`/users/update/${regularUser._id}`)
                .send(updateData);

            expect(response.status).toBe(200);

            // Verify the user was updated
            const userListResponse = await authenticatedRequest(server, adminToken).get('/users/list');
            const updatedUser = userListResponse.body.find((user: any) => user._id === regularUser._id);

            expect(updatedUser.name).toBe(updateData.name);
            expect(updatedUser.email).toBe(updateData.email);
            expect(updatedUser.department).toBe(updateData.department);
            expect(updatedUser.group).toBe(updateData.group);
        });

        test('regular user should be able to update their own user', async () => {
            const updateData: I_UserUpdate = {
                name: 'Self Updated Name',
                email: 'selfupdated@example.com'
            };

            const response = await authenticatedRequest(server, userToken)
                .patch(`/users/update/${regularUser._id}`)
                .send(updateData);

            expect(response.status).toBe(200);

            // Verify the user was updated
            const userListResponse = await authenticatedRequest(server, userToken).get('/users/list');
            const updatedUser = userListResponse.body[0];

            expect(updatedUser.name).toBe(updateData.name);
            expect(updatedUser.email).toBe(updateData.email);
        });

        test('regular user should not be able to update another user', async () => {
            const updateData: I_UserUpdate = {
                name: 'Hacked Admin',
                isAdmin: true
            };

            const response = await authenticatedRequest(server, userToken)
                .patch(`/users/update/${adminUser._id}`)
                .send(updateData);

            expect(response.status).toBe(401);
        });

        test('should return 404 for non-existent user', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .patch('/users/update/nonexistentid')
                .send({name: 'New Name'});

            expect(response.status).toBe(404);
        });
    });

    describe('POST /users/create', () => {
        test('admin should be able to create a new user', async () => {
            const newUser: I_UserCreation = {
                name: 'New Test User',
                password: 'newuserpassword',
                email: 'newuser@example.com',
                department: 'Testing',
                group: 'Testers',
                isAdmin: false
            };

            const response = await authenticatedRequest(server, adminToken)
                .post('/users/create')
                .send(newUser);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('_id');
            expect(response.body.name).toBe(newUser.name);
            expect(response.body.email).toBe(newUser.email);
            expect(response.body.department).toBe(newUser.department);
            expect(response.body.group).toBe(newUser.group);

            // Verify the user was added to the database
            const userListResponse = await authenticatedRequest(server, adminToken).get('/users/list');
            const createdUser = userListResponse.body.find((user: any) => user.name === newUser.name);
            expect(createdUser).toBeDefined();
        });

        test('regular user should not be able to create a new user', async () => {
            const newUser: I_UserCreation = {
                name: 'Unauthorized User',
                password: 'password',
                email: 'unauthorized@example.com',
                department: 'Testing',
                group: 'Testers',
                isAdmin: false
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/users/create')
                .send(newUser);

            expect(response.status).toBe(401);
        });

        test('should validate required fields', async () => {
            const incompleteUser = {
                name: 'Incomplete User',
                // Missing required fields
            };

            const response = await authenticatedRequest(server, adminToken)
                .post('/users/create')
                .send(incompleteUser);

            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /users/remove/{userID}', () => {
        test('admin should be able to remove a user', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .delete(`/users/remove/${regularUser._id}`);

            expect(response.status).toBe(200);

            // Verify the user was removed
            const userListResponse = await authenticatedRequest(server, adminToken).get('/users/list');
            const deletedUser = userListResponse.body.find((user: any) => user._id === regularUser._id);
            expect(deletedUser).toBeUndefined();
        });

        test('regular user should not be able to remove a user', async () => {
            const response = await authenticatedRequest(server, userToken)
                .delete(`/users/remove/${adminUser._id}`);

            expect(response.status).toBe(401);
        });

        test('should return 404 for non-existent user', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .delete('/users/remove/nonexistentid');

            expect(response.status).toBe(404);
        });
    });
});