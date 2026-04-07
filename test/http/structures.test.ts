import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    authenticatedRequest
} from '../setup/testSetup.js';
import type {I_StructureCreation, I_StructureEntry, I_StructureUpdate} from "docpouch-client";

describe('Data Structure API Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let testStructureId: string;

    // Set up the test server before all tests
    beforeAll(async () => {
        // Set up the test server
        const setup = await setupTestServer();
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
        server = setup.server;
    });

    // Clean up the test database before each test
    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        // Create test users
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;

        // Create a test data structure as admin
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

        const response = await authenticatedRequest(server, adminToken)
            .post('/structures/create')
            .send(testStructure);
        testStructureId = response.body._id;
    });

    // Close the test server after all tests
    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    describe('POST /structures/create', () => {
        test('admin should be able to create a new data structure', async () => {
            const newStructure: I_StructureCreation = {
                name: 'New Test Structure',
                fields: [
                    {
                        name: 'Text Field',
                        type: 'string'
                    },
                    {
                        name: 'Boolean Field',
                        type: 'boolean'
                    },
                    {
                        name: 'Array Field',
                        type: 'array',
                        items: 'string'
                    }
                ]
            };

            const response = await authenticatedRequest(server, adminToken)
                .post('/structures/create')
                .send(newStructure);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('_id');
            expect(response.body.name).toBe(newStructure.name);
            expect(response.body.fields).toHaveLength(newStructure.fields.length);

            // Check that fields are correctly saved
            expect(response.body.fields[0].name).toBe(newStructure.fields[0].name);
            expect(response.body.fields[0].type).toBe(newStructure.fields[0].type);
            expect(response.body.fields[1].name).toBe(newStructure.fields[1].name);
            expect(response.body.fields[1].type).toBe(newStructure.fields[1].type);
            expect(response.body.fields[2].name).toBe(newStructure.fields[2].name);
            expect(response.body.fields[2].type).toBe(newStructure.fields[2].type);
            expect(response.body.fields[2].items).toBe(newStructure.fields[2].items);
        });

        test('regular user should not be able to create a data structure', async () => {
            const newStructure: I_StructureCreation = {
                name: 'Unauthorized Structure',
                fields: [
                    {
                        name: 'Field',
                        type: 'string'
                    }
                ]
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/structures/create')
                .send(newStructure);

            expect(response.status).toBe(401);
        });

        test('should validate required fields', async () => {
            const incompleteStructure = {
                title: 'Incomplete Structure'
                // Missing fields array
            };

            const response = await authenticatedRequest(server, adminToken)
                .post('/structures/create')
                .send(incompleteStructure);

            expect(response.status).toBe(400);
        });

        test('should return 401 for unauthenticated request', async () => {
            const newStructure = {
                title: 'Unauthenticated Structure',
                fields: [
                    {
                        name: 'Field',
                        type: 'string'
                    }
                ]
            };

            const response = await request(server)
                .post('/structures/create')
                .send(newStructure);

            expect(response.status).toBe(401);
        });
    });

    describe('GET /structures/list', () => {

        test('admin should be able to get all data structures', async () => {
            // Create another structure
            const anotherStructure: I_StructureCreation = {
                name: 'Another Structure',
                fields: [
                    {
                        name: 'Field',
                        type: 'string'
                    }
                ]
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/structures/create')
                .send(anotherStructure);

            const response = await authenticatedRequest(server, adminToken).get('/structures/list');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(2); // At least the test structure and the new one

            // Check that both structures are in the response
            const testStructure = response.body.find((structure: any) => structure._id === testStructureId);
            const newStructure = response.body.find((structure: any) => structure._id === createResponse.body._id);

            expect(testStructure).toBeDefined();
            expect(newStructure).toBeDefined();
        });

        test('regular user should be able to get all data structures', async () => {
            const response = await authenticatedRequest(server, userToken).get('/structures/list');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(1); // At least the test structure

            // Check that the test structure is in the response
            const testStructure = response.body.find((structure: I_StructureEntry) => structure._id === testStructureId);
            expect(testStructure).toBeDefined();
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(server).get('/structures/list');
            expect(response.status).toBe(401);
        });
    });

    describe('PATCH /structures/update/{structureID}', () => {
        test('admin should be able to update a data structure', async () => {
            const updateData: I_StructureUpdate = {
                name: 'Updated Structure Title',
                fields: [
                    {
                        name: 'Updated Field 1',
                        type: 'string'
                    },
                    {
                        name: 'Updated Field 2',
                        type: 'number'
                    },
                    {
                        name: 'New Field',
                        type: 'boolean'
                    }
                ]
            };
            const response = await authenticatedRequest(server, adminToken)
                .patch(`/structures/update/${testStructureId}`)
                .send(updateData);

            expect(response.status).toBe(200);

            // Verify the structure was updated
            const listResponse = await authenticatedRequest(server, adminToken).get('/structures/list');
            const updatedStructure: I_StructureEntry = listResponse.body.find((structure: any) => structure._id === testStructureId);

            expect(updatedStructure.name).toBe(updateData.name);
            expect(updatedStructure.fields).toHaveLength(updateData.fields.length);
            expect(updatedStructure.fields[0].name).toBe(updateData.fields[0].name);
            expect(updatedStructure.fields[2].name).toBe(updateData.fields[2].name);
            expect(updatedStructure.fields[2].type).toBe(updateData.fields[2].type);
        });

        test('regular user should not be able to update a data structure', async () => {
            const updateData: I_StructureUpdate = {
                name: 'Unauthorized Update',
                fields: [
                    {
                        name: 'Unauthorized Field',
                        type: 'string'
                    }
                ]
            };

            const response = await authenticatedRequest(server, userToken)
                .patch(`/structures/update/${testStructureId}`)
                .send(updateData);

            expect(response.status).toBe(401);
        });

        test('should return 404 for non-existent structure', async () => {
            const updateData = {
                title: 'Non-existent Structure Update',
                fields: [
                    {
                        name: 'Field',
                        type: 'string'
                    }
                ]
            };

            const response = await authenticatedRequest(server, adminToken)
                .patch('/structures/update/nonexistentid')
                .send(updateData);

            expect(response.status).toBe(404);
        });

        test('should return 401 for unauthenticated request', async () => {
            const updateData = {
                title: 'Unauthenticated Update',
                fields: [
                    {
                        name: 'Field',
                        type: 'string'
                    }
                ]
            };

            const response = await request(server)
                .patch(`/structures/update/${testStructureId}`)
                .send(updateData);

            expect(response.status).toBe(401);
        });
    });

    describe('DELETE /structures/remove/{structureID}', () => {
        test('admin should be able to remove a data structure', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .delete(`/structures/remove/${testStructureId}`);

            expect(response.status).toBe(200);

            // Verify the structure was removed
            const listResponse = await authenticatedRequest(server, adminToken).get('/structures/list');
            const deletedStructure = listResponse.body.find((structure: any) => structure._id === testStructureId);
            expect(deletedStructure).toBeUndefined();
        });

        test('regular user should not be able to remove a data structure', async () => {
            const response = await authenticatedRequest(server, userToken)
                .delete(`/structures/remove/${testStructureId}`);

            expect(response.status).toBe(401);

            // Verify the structure was not removed
            const listResponse = await authenticatedRequest(server, adminToken).get('/structures/list');
            const structure = listResponse.body.find((s: any) => s._id === testStructureId);
            expect(structure).toBeDefined();
        });

        test('should return 404 for non-existent structure', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .delete('/structures/remove/nonexistentid');

            expect(response.status).toBe(404);
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(server)
                .delete(`/structures/remove/${testStructureId}`);

            expect(response.status).toBe(401);
        });
    });
});