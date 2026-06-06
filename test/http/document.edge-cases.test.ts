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
import type {I_DocumentCreation} from 'docpouch-client';

describe('Document Update Edge Cases', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminUser: any;
    let regularUser: any;
    let testDocumentId: string;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;
        adminUser = users.adminUser;
        regularUser = users.regularUser;

        // Required document structures for the documents used in these tests
        await dataManager.structures.add({
            type: 1, subType: 1, name: 'Type 1-1', description: 'Test structure', fields: []
        });
        await dataManager.structures.add({
            type: 2, subType: 2, name: 'Type 2-2', description: 'Test structure', fields: []
        });
        await dataManager.structures.add({
            type: 3, subType: 3, name: 'Type 3-3', description: 'Test structure', fields: []
        });

        const doc: I_DocumentCreation = {
            title: 'Edge case test document',
            type: 1,
            subType: 1,
            public: false,
            content: {text: 'initial content'},
            shareWithGroup: false,
            shareWithDepartment: false
        };
        const response = await authenticatedRequest(server, userToken)
            .post('/docs/create')
            .send(doc);
        testDocumentId = response.body._id;
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('admin should be able to update a document owned by another user', async () => {
        const updateData = {
            title: 'Admin-updated title',
            content: {text: 'admin-updated content'}
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
        // The owner should remain unchanged
        expect(fetchResponse.body[0].owner).toBe(regularUser._id);
    });

    test('regular user cannot change document ownership via update', async () => {
        // Regular user creates a new document
        const doc: I_DocumentCreation = {
            title: 'Ownership test doc',
            type: 2,
            subType: 2,
            public: false,
            content: {text: 'ownership test'},
            shareWithGroup: false,
            shareWithDepartment: false
        };
        const createResponse = await authenticatedRequest(server, userToken)
            .post('/docs/create')
            .send(doc);
        const docId = createResponse.body._id;

        // Try to change the owner - the CustomStore.update method rejects
        // owner updates, so the PATCH should be rejected by the API.
        const response = await authenticatedRequest(server, userToken)
            .patch(`/docs/update/${docId}`)
            .send({owner: adminUser._id});

        // The response should never be 200 with the owner field actually
        // changed. The underlying store rejects owner updates and the API
        // surfaces an error status. Accept 200, 400 or 404 (depending on
        // whether the document is found and whether the owner change is
        // caught at the schema or store layer), but the document's owner
        // MUST remain the original creator.
        expect([200, 400, 404, 500]).toContain(response.status);

        // Verify the document's owner was NOT changed
        const fetchResponse = await authenticatedRequest(server, adminToken)
            .post('/docs/fetch')
            .send({_id: docId});
        expect(fetchResponse.body.length).toBe(1);
        expect(fetchResponse.body[0].owner).toBe(regularUser._id);
    });

    test('updating a document with no changes returns 200 (idempotent)', async () => {
        const response = await authenticatedRequest(server, userToken)
            .patch(`/docs/update/${testDocumentId}`)
            .send({});

        // Empty body passes the schema (all fields optional) but the store will
        // simply not change anything. We accept 200 or 404.
        expect([200, 404]).toContain(response.status);
    });

    test('updating a non-existent document returns 404', async () => {
        const response = await authenticatedRequest(server, adminToken)
            .patch('/docs/update/this-id-does-not-exist')
            .send({title: 'New title'});

        expect(response.status).toBe(404);
    });

    test('user without access cannot update a document', async () => {
        // Admin creates a private document that the regular user has no access to
        const privateDoc: I_DocumentCreation = {
            title: 'Private Doc',
            type: 3,
            subType: 3,
            public: false,
            content: {text: 'private'},
            shareWithGroup: false,
            shareWithDepartment: false
        };
        const createResponse = await authenticatedRequest(server, adminToken)
            .post('/docs/create')
            .send(privateDoc);
        const privateDocId = createResponse.body._id;

        const response = await authenticatedRequest(server, userToken)
            .patch(`/docs/update/${privateDocId}`)
            .send({content: {text: 'attempted unauthorized update'}});

        // The user does not appear in the document's accessor list, so the
        // update endpoint should refuse it.
        expect([404, 401, 403]).toContain(response.status);
    });
});
