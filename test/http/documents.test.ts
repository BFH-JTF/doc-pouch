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
import type {I_DocumentCreation, I_DocumentQuery, I_DocumentUpdate} from "docpouch-client";

describe('Document Management API Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminUser: any;
    let regularUser: any;
    let testDocumentId: string;

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
        // Create test users
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;
        adminUser = users.adminUser;
        regularUser = users.regularUser;

        // Create required document types
        await dataManager.types.add({type: 1, subType: 1, name: 'Type 1-1'});
        await dataManager.types.add({type: 2, subType: 3, name: 'Type 2-3'});
        await dataManager.types.add({type: 3, subType: 2, name: 'Type 3-2'});
        await dataManager.types.add({type: 4, subType: 5, name: 'Type 4-5'});
        await dataManager.types.add({type: 7, subType: 8, name: 'Type 7-8'});
        await dataManager.types.add({type: 9, subType: 10, name: 'Type 9-10'});
        await dataManager.types.add({type: 11, subType: 12, name: 'Type 11-12'});
        await dataManager.types.add({type: 10, subType: 20, name: 'Type 10-20'});

        // Create a test document for the regular user
        const testDocument: I_DocumentCreation = {
            title: 'Test Document',
            type: 1,
            subType: 1,
            public: false,
            content: {text: 'This is a test document'},
            shareWithGroup: false,
            shareWithDepartment: false
        };

        const response = await authenticatedRequest(server, userToken)
            .post('/docs/create')
            .send(testDocument);
        testDocumentId = response.body._id;
    });

    // Close the test server after all tests
    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    describe('POST /docs/create', () => {
        test('should create a new document for authenticated user', async () => {
            const newDocument: I_DocumentCreation = {
                title: 'New Test Document',
                type: 2,
                subType: 3,
                public: false,
                content: {text: 'This is a new test document'},
                shareWithGroup: true,
                shareWithDepartment: false
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('_id');
            expect(response.body.title).toBe(newDocument.title);
            expect(response.body.type).toBe(newDocument.type);
            expect(response.body.subType).toBe(newDocument.subType);
            expect(response.body.content).toStrictEqual(newDocument.content);
            expect(response.body.shareWithGroup).toBe(newDocument.shareWithGroup);
            expect(response.body.shareWithDepartment).toBe(newDocument.shareWithDepartment);

            const response2 = await authenticatedRequest(server, adminToken).get('/docs/list');
            expect(response2.status).toBe(200);
            expect(Array.isArray(response2.body)).toBe(true);
            expect(response2.body.length).toBeGreaterThanOrEqual(2); // At least the test document and admin document

        });

        test('should return 401 for unauthenticated request', async () => {
            const newDocument = {
                title: 'Unauthenticated Document',
                type: 1,
                subType: 1,
                public: false,
                content: JSON.stringify({text: 'This should not be created'}),
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const response = await request(server)
                .post('/docs/create')
                .send(newDocument);

            expect(response.status).toBe(401);
        });

        test('should validate required fields', async () => {
            const incompleteDocument = {
                title: 'Incomplete Document',
                // Missing required fields
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(incompleteDocument);

            expect(response.status).toBe(400);
        });
    });

    describe('GET /docs/list', () => {
        test('admin should see all documents', async () => {
            // Create another document for admin
            const adminDocument = {
                title: 'Admin Document',
                type: 3,
                subType: 2,
                public: false,
                content: {text: 'This is an admin document'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const createResp = await authenticatedRequest(server, adminToken)
                .post('/docs/create')
                .send(adminDocument);
            expect(createResp.status).toBe(200);

            const response = await authenticatedRequest(server, adminToken).get('/docs/list');
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(2); // At least the test document and admin document

            // Check that both documents are in the response
            const testDoc = response.body.find((doc: any) => doc._id === testDocumentId);
            const adminDoc = response.body.find((doc: any) => doc.title === adminDocument.title);

            expect(testDoc).toBeDefined();
            expect(adminDoc).toBeDefined();
        });

        test('regular user should only see their own documents', async () => {
            // Create another document for admin
            const adminDocument = {
                title: 'Admin Document',
                type: 3,
                subType: 2,
                public: false,
                content: {text: 'This is an admin document'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            await authenticatedRequest(server, adminToken)
                .post('/docs/create')
                .send(adminDocument);

            const response = await authenticatedRequest(server, userToken).get('/docs/list');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(1); // Only the test document
            expect(response.body[0]._id).toBe(testDocumentId);
        });

        test('regular user should see shared documents', async () => {
            // Create a document shared with the user's group
            const sharedDocument = {
                title: 'Shared Document',
                type: 4,
                subType: 5,
                public: false,
                content: {text: 'This is a shared document'},
                shareWithGroup: false,
                shareWithDepartment: true
            };

            // Update the admin user to be in the same group as the regular user
            await authenticatedRequest(server, adminToken)
                .patch(`/users/update/${adminUser._id}`)
                .send({group: regularUser.group});

            // Create a shared document as admin
            await authenticatedRequest(server, adminToken)
                .post('/docs/create')
                .send(sharedDocument);

            const response = await authenticatedRequest(server, userToken).get('/docs/list');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(2); // The test document and the shared document

            // Check that the shared document is in the response
            const sharedDoc = response.body.find((doc: any) => doc.title === sharedDocument.title);
            expect(sharedDoc).toBeDefined();
            expect(sharedDoc.shareWithDepartment).toBe(true);
        });

        test('should return 401 for unauthenticated request', async () => {
            const response = await request(server).get('/docs/list');
            expect(response.status).toBe(401);
        });
    });

    describe('POST /docs/fetch', () => {
        test('should fetch documents based on query', async () => {
            const query = {
                _id: testDocumentId
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/fetch')
                .send(query);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toEqual(1);
            expect(response.body[0]).toHaveProperty('_id');
            expect(response.body[0]._id).toBe(testDocumentId);
            expect(response.body[0].title).toBe('Test Document');
        });

        test('should fetch documents based on type and subType', async () => {
            // Create documents with specific type and subType
            const specificDocument = {
                title: 'Specific Type Document',
                type: 10,
                subType: 20,
                public: false,
                content: {text: 'This has a specific type and subtype'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(specificDocument);

            const query: I_DocumentQuery = {type: 10, subType: 20};

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/fetch')
                .send(query);

            expect(response.status).toBe(200);
            expect(response.body.length).toEqual(1);
            expect(response.body[0]).toHaveProperty('_id');
            expect(response.body[0].title).toBe(specificDocument.title);
            expect(response.body[0].type).toBe(specificDocument.type);
            expect(response.body[0].subType).toBe(specificDocument.subType);
        });

        test('should return 404 for non-existent document', async () => {
            const query = [
                {
                    _id: 'nonexistentid'
                }
            ];

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/fetch')
                .send(query);

            expect(response.status).toBe(200);
            expect(response.body.length).toEqual(0);
        });

        test('should return 401 for unauthorized access to document', async () => {
            // Create a document as admin that is not shared
            const privateDocument = {
                title: 'Private Admin Document',
                type: 5,
                subType: 6,
                content: JSON.stringify({text: 'This is a private admin document'}),
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/docs/create')
                .send(privateDocument);

            const privateDocId = createResponse.body._id;

            // Try to fetch the private document as regular user
            const query = [
                {
                    _id: privateDocId
                }
            ];

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/fetch')
                .send(query);

            expect(response.status).toBe(200);
            expect(response.body.length).toEqual(0);
        });
    });

    describe('PATCH /docs/update/{documentID}', () => {
        test('owner should be able to update their document', async () => {
            const updateData: I_DocumentUpdate = {
                title: 'Updated Document Title',
                content: {text: 'This document has been updated'},
                shareWithGroup: true
            };

            const response = await authenticatedRequest(server, userToken)
                .patch(`/docs/update/${testDocumentId}`)
                .send(updateData);

            expect(response.status).toBe(200);

            // Verify the document was updated
            const fetchResponse = await authenticatedRequest(server, userToken)
                .post('/docs/fetch')
                .send({_id: testDocumentId});
            expect(fetchResponse.body.length).toEqual(1);
            expect(fetchResponse.body[0].title).toBe(updateData.title);
            expect(fetchResponse.body[0].content).toEqual(updateData.content);
            expect(fetchResponse.body[0].shareWithGroup).toBe(updateData.shareWithGroup);
        });

        test('admin should be able to update any document', async () => {
            const updateData: I_DocumentUpdate = {
                _id: testDocumentId,
                title: 'Admin Updated Document',
                content: {text: 'This document has been updated by admin'}
            };

            const response = await authenticatedRequest(server, adminToken)
                .patch(`/docs/update/${testDocumentId}`)
                .send(updateData);

            expect(response.status).toBe(200);

            // Verify the document was updated
            const fetchResponse = await authenticatedRequest(server, adminToken)
                .post('/docs/fetch')
                .send({_id: testDocumentId});

            expect(fetchResponse.body.length).toBe(1);
            expect(fetchResponse.body[0].title).toBe(updateData.title);
            expect(fetchResponse.body[0].content).toEqual(updateData.content);
        });

        test('user with shared access should only be able to update content', async () => {
            // Create a document shared with the user's group
            const sharedDocument = {
                title: 'Shared Document for Update',
                type: 7,
                subType: 8,
                public: false,
                content: {text: 'This is a shared document for update test'},
                shareWithGroup: true,
                shareWithDepartment: false
            };

            // Update the admin user to be in the same group as the regular user
            await authenticatedRequest(server, adminToken)
                .patch(`/users/update/${adminUser._id}`)
                .send({group: regularUser.group});

            // Create a shared document as admin
            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/docs/create')
                .send(sharedDocument);

            const sharedDocId = createResponse.body._id;

            // Try to update the title and content as regular user
            const updateData = {
                title: 'Attempted Title Change',
                content: {text: 'This content should be updated'}
            };

            const response = await authenticatedRequest(server, userToken)
                .patch(`/docs/update/${sharedDocId}`)
                .send(updateData);

            expect(response.status).toBe(200);

            // Verify only the content was updated
            const fetchResponse = await authenticatedRequest(server, userToken)
                .post('/docs/fetch')
                .send({_id: sharedDocId});

            expect(fetchResponse.body.length).toBe(1);
            expect(fetchResponse.body[0].title).toBe(sharedDocument.title); // Title should not change
            expect(fetchResponse.body[0].content).toEqual(updateData.content); // Content should change
        });

        test('should return 401 for unauthorized access to document', async () => {
            // Create a document as admin that is not shared
            const privateDocument = {
                title: 'Private Admin Document for Update',
                type: 9,
                subType: 10,
                public: false,
                content: {text: 'This is a private admin document for update test'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/docs/create')
                .send(privateDocument);

            const privateDocId = createResponse.body._id;

            // Try to update the document as regular user
            const updateData = {
                content: {text: 'Attempted update'}
            };

            const response = await authenticatedRequest(server, userToken)
                .patch(`/docs/update/${privateDocId}`)
                .send(updateData);

            expect(response.status).toBe(404);
        });

        test('should return 404 for non-existent document', async () => {
            const response = await authenticatedRequest(server, userToken)
                .patch('/docs/update/nonexistentid')
                .send({title: 'New Title'});

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /docs/remove/{documentID}', () => {
        test('owner should be able to remove their document', async () => {
            const response = await authenticatedRequest(server, userToken)
                .delete(`/docs/remove/${testDocumentId}`);

            expect(response.status).toBe(200);

            // Verify the document was removed
            const listResponse = await authenticatedRequest(server, userToken).get('/docs/list');
            const deletedDoc = listResponse.body.find((doc: any) => doc._id === testDocumentId);
            expect(deletedDoc).toBeUndefined();
        });

        test('admin should be able to remove any document', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .delete(`/docs/remove/${testDocumentId}`);

            expect(response.status).toBe(200);

            // Verify the document was removed
            const listResponse = await authenticatedRequest(server, adminToken).get('/docs/list');
            const deletedDoc = listResponse.body.find((doc: any) => doc._id === testDocumentId);
            expect(deletedDoc).toBeUndefined();
        });

        test('user with shared access should not be able to remove document', async () => {
            // Create a document shared with the user's group
            const sharedDocument = {
                title: 'Shared Document for Delete',
                type: 11,
                subType: 12,
                public: false,
                content: {text: 'This is a shared document for delete test'},
                shareWithGroup: true,
                shareWithDepartment: false
            };

            // Update the admin user to be in the same group as the regular user
            await authenticatedRequest(server, adminToken)
                .patch(`/users/update/${adminUser._id}`)
                .send({group: regularUser.group});

            // Create a shared document as admin
            const createResponse = await authenticatedRequest(server, adminToken)
                .post('/docs/create')
                .send(sharedDocument);

            const sharedDocId = createResponse.body._id;

            // Try to delete the document as regular user
            const response = await authenticatedRequest(server, userToken)
                .delete(`/docs/remove/${sharedDocId}`);

            expect(response.status).toBe(401);

            // Verify the document was not removed
            const listResponse = await authenticatedRequest(server, userToken)
                .post('/docs/fetch')
                .send({_id: sharedDocId});

            expect(listResponse.body.length).toBeGreaterThanOrEqual(1);
        });

        test('should return 404 for non-existent document', async () => {
            const response = await authenticatedRequest(server, userToken)
                .delete('/docs/remove/nonexistentid');

            expect(response.status).toBe(404);
        });
    });
});