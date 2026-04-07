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
import type {I_DocumentCreation, I_DocumentType} from 'docpouch-client';

describe('Document Type API Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let testTypeId: string;
    let testStructureId: undefined;

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

        // Create a test document type as admin
        const testType = {
            name: 'Test Document Type',
            description: 'A test document type for testing',
            type: 1,
            subType: 1,
        };

        const typeResponse = await authenticatedRequest(server, adminToken)
            .post('/types/write')
            .send(testType);

        testTypeId = typeResponse.body._id;
    });

    // Close the test server after all tests
    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    describe('GET /types/list', () => {
        test('admin should be able to get all document types', async () => {
            // Create another document type
            const anotherType: I_DocumentType = {
                name: 'Another Document Type',
                description: 'Another test document type',
                type: 2,
                subType: 2,
            };

            let writeResponse = await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(anotherType);

            expect(writeResponse.status).toBe(200);

            const response = await authenticatedRequest(server, adminToken).get('/types/list');
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(2); // At least the test type and the new one

            // Check that both types are in the response
            const testType = response.body.find((type: any) => type._id === testTypeId);
            const newType = response.body.find((type: any) => type.name === anotherType.name);

            expect(testType).toBeDefined();
            expect(newType).toBeDefined();
        });

        test('regular user should be able to get all document types', async () => {
            const response = await authenticatedRequest(server, userToken).get('/types/list');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(1); // At least the test type

            // Check that the test type is in the response
            const testType = response.body.find((type: any) => type._id === testTypeId);
            expect(testType).toBeDefined();
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(server).get('/types/list');
            expect(response.status).toBe(401);
        });
    });

    describe('POST /types/write', () => {
        test('admin should be able to create a new document type', async () => {
            const newType = {
                name: 'New Document Type',
                description: 'A new document type for testing',
                type: 3,
                subType: 3,
            };

            const response = await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(newType);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('_id');
            expect(response.body.name).toBe(newType.name);
            expect(response.body.description).toBe(newType.description);
            expect(response.body.type).toBe(newType.type);
            expect(response.body.subType).toBe(newType.subType);

            // Verify the type was added
            const listResponse = await authenticatedRequest(server, adminToken).get('/types/list');
            const createdType = listResponse.body.find((type: any) => type.name === newType.name);
            expect(createdType).toBeDefined();
        });

        test('admin should be able to update an existing document type', async () => {
            const updateType = {
                _id: testTypeId,
                name: 'Updated Document Type',
                description: 'An updated document type',
                type: 1,
                subType: 1,
            };

            const response = await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(updateType);

            expect(response.status).toBe(200);
            expect(response.body._id).toBe(testTypeId);
            expect(response.body.name).toBe(updateType.name);
            expect(response.body.description).toBe(updateType.description);

            // Verify the type was updated
            const listResponse = await authenticatedRequest(server, adminToken).get('/types/list');
            const updatedType = listResponse.body.find((type: any) => type._id === testTypeId);
            expect(updatedType.name).toBe(updateType.name);
            expect(updatedType.description).toBe(updateType.description);
        });

        test('regular user should not be able to create or update a document type', async () => {
            const newType: I_DocumentType = {
                name: 'Unauthorized Type',
                description: 'This should not be created',
                type: 4,
                subType: 4,
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/types/write')
                .send(newType);

            expect(response.status).toBe(401);
        });

        test('should validate required fields', async () => {
            const incompleteType = {
                name: 'Incomplete Type',
                // Missing required fields
            };

            const response = await authenticatedRequest(server, adminToken)
                .post('/types/write')
                .send(incompleteType);

            expect(response.status).toBe(400);
        });

        test('should return 401 for unauthenticated request', async () => {
            const newType = {
                name: 'Unauthenticated Type',
                description: 'This should not be created',
                type: 5,
                subType: 5,
            };

            const response = await request(server)
                .post('/types/write')
                .send(newType);

            expect(response.status).toBe(401);
        });
    });

    describe('DELETE /types/remove/{documentTypeID}', () => {
        test('admin should be able to remove a document type', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .delete(`/types/remove/${testTypeId}`);

            expect(response.status).toBe(200);

            // Verify the type was removed
            const listResponse = await authenticatedRequest(server, adminToken).get('/types/list');
            const deletedType = listResponse.body.find((type: any) => type._id === testTypeId);
            expect(deletedType).toBeUndefined();
        });

        test('regular user should not be able to remove a document type', async () => {
            const response = await authenticatedRequest(server, userToken)
                .delete(`/types/remove/${testTypeId}`);

            expect(response.status).toBe(401);

            // Verify the type was not removed
            const listResponse = await authenticatedRequest(server, adminToken).get('/types/list');
            const type = listResponse.body.find((t: any) => t._id === testTypeId);
            expect(type).toBeDefined();
        });

        test('should return 404 for non-existent document type', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .delete('/types/remove/nonexistentid');

            expect(response.status).toBe(404);
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(server)
                .delete(`/types/remove/${testTypeId}`);

            expect(response.status).toBe(401);
        });
    });
});