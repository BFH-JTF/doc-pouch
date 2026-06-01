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
import type {I_DocumentCreation, I_DocumentEntry} from "docpouch-client";

// Extend the interface to include the anonymous field
interface I_AnonymousDocumentCreation extends I_DocumentCreation {
    anonymous?: boolean;
}

describe('Anonymous Document API Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
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

    // Clean up the test database before each test
    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        // Create test users
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;
        adminUser = users.adminUser;
        regularUser = users.regularUser;

        // Create required document structures
        await dataManager.structures.add({
            type: 1,
            subType: 1,
            name: 'Feedback Structure',
            description: 'Structure for anonymous feedback',
            fields: []
        });
    });

    // Close the test server after all tests
    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    describe('POST /docs/create with anonymous flag', () => {
        test('should create an anonymous document with the admin user as owner', async () => {
            // Use the same approach as the working tests but add the anonymous flag
            const newDocument: any = {
                title: 'Anonymous Feedback',
                type: 1,
                subType: 1,
                public: false,
                content: {feedback: 'This is anonymous feedback'},
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: true // This is our new flag
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('_id');
            expect(response.body.title).toBe(newDocument.title);
            
            // Check that the owner is the admin user
            const adminUser = await dataManager.getUserByID(response.body.owner);
            expect(adminUser.name).toBe('admin');
        });

        test('should create a regular document when anonymous flag is false', async () => {
            const newDocument: any = {
                title: 'Regular Document',
                type: 1,
                subType: 1,
                public: false,
                content: {text: 'This is a regular document'},
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: false // Explicitly set to false
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('_id');
            expect(response.body.title).toBe(newDocument.title);
            
            // Check that the owner is the regular user
            expect(response.body.owner).toBe(regularUser._id);
        });

        test('should create a regular document when anonymous flag is not provided', async () => {
            // Note: This test depends on the client library allowing partial objects
            // If this fails, we may need to adjust our implementation
            const newDocument = {
                title: 'Regular Document Without Flag',
                type: 1,
                subType: 1,
                public: false,
                content: {text: 'This is a regular document without the anonymous flag'},
                shareWithGroup: false,
                shareWithDepartment: false
                // Note: No anonymous flag provided
            };

            const response = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(newDocument);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('_id');
            expect(response.body.title).toBe(newDocument.title);
            
            // Check that the owner is the regular user
            expect(response.body.owner).toBe(regularUser._id);
        });

        test('anonymous document should not be editable by original creator', async () => {
            // Create an anonymous document
            const anonymousDocument: any = {
                title: 'Anonymous Feedback',
                type: 1,
                subType: 1,
                public: false,
                content: {feedback: 'This is anonymous feedback'},
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: true
            };

            const createResponse = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(anonymousDocument);

            expect(createResponse.status).toBe(200);
            const documentId = createResponse.body._id;

            // Try to update the document as the original creator
            const updateData = {
                title: 'Attempted Update',
                content: {feedback: 'Updated feedback'}
            };

            const updateResponse = await authenticatedRequest(server, userToken)
                .patch(`/docs/update/${documentId}`)
                .send(updateData);

            // Should fail because the owner is now the Anonymous user, not the creator
            expect([404, 401]).toContain(updateResponse.status);
        });

        test('anonymous document should be editable by admin', async () => {
            // Create an anonymous document
            const anonymousDocument: any = {
                title: 'Anonymous Feedback',
                type: 1,
                subType: 1,
                public: false,
                content: {feedback: 'This is anonymous feedback'},
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: true
            };

            const createResponse = await authenticatedRequest(server, userToken)
                .post('/docs/create')
                .send(anonymousDocument);

            expect(createResponse.status).toBe(200);
            const documentId = createResponse.body._id;

            // Try to update the document as admin
            const updateData = {
                title: 'Admin Update',
                content: {feedback: 'Updated by admin'}
            };

            const updateResponse = await authenticatedRequest(server, adminToken)
                .patch(`/docs/update/${documentId}`)
                .send(updateData);

            // Should succeed because admin can edit any document
            expect(updateResponse.status).toBe(200);
        });
    });
});