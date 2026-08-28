import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import EmailService from '../../src/srv/EmailService.js';
import type {I_CorsOption} from '../../src/types.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    createMemoryTestLogger
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

    // Set up the test server before all tests (anonymous documents enabled
    // so the existing happy-path tests can run as before).
    beforeAll(async () => {
        const setup = await setupTestServer({anonymousDocumentsEnabled: true});
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

        // Allow anonymous creation for this structure
        await dataManager.setAnonymousAllowed(1, 1, adminUser._id);
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

            const response = await request(server)
                .post('/docs/create')
                .set('Authorization', `Bearer ${userToken}`)
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

            const response = await request(server)
                .post('/docs/create')
                .set('Authorization', `Bearer ${userToken}`)
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

            const response = await request(server)
                .post('/docs/create')
                .set('Authorization', `Bearer ${userToken}`)
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

            const createResponse = await request(server)
                .post('/docs/create')
                .set('Authorization', `Bearer ${userToken}`)
                .send(anonymousDocument);

            expect(createResponse.status).toBe(200);
            const documentId = createResponse.body._id;

            // Try to update the document as the original creator
            const updateData = {
                title: 'Attempted Update',
                content: {feedback: 'Updated feedback'}
            };

            const updateResponse = await request(server)
                .patch(`/docs/update/${documentId}`)
                .set('Authorization', `Bearer ${userToken}`)
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

            const createResponse = await request(server)
                .post('/docs/create')
                .set('Authorization', `Bearer ${userToken}`)
                .send(anonymousDocument);

            expect(createResponse.status).toBe(200);
            const documentId = createResponse.body._id;

            // Try to update the document as admin
            const updateData = {
                title: 'Admin Update',
                content: {feedback: 'Updated by admin'}
            };

            const updateResponse = await request(server)
                .patch(`/docs/update/${documentId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData);

            // Should succeed because admin can edit any document
            expect(updateResponse.status).toBe(200);
        });
    });
});

describe('Anonymous Document API Tests with flag disabled', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let regularUser: any;

    beforeAll(async () => {
        const setup = await setupTestServer({anonymousDocumentsEnabled: false});
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;
        regularUser = users.regularUser;

        await dataManager.structures.add({
            type: 1,
            subType: 1,
            name: 'Feedback Structure',
            description: 'Structure for anonymous feedback',
            fields: []
        });

        // Also add to allowlist - even though the global flag is off,
        // this ensures the allowlist works correctly in combination.
        await dataManager.setAnonymousAllowed(1, 1, regularUser._id).catch(() => {
        });
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('should reject anonymous document creation with 400 when flag is off', async () => {
        const newDocument: any = {
            title: 'Anonymous Feedback',
            type: 1,
            subType: 1,
            public: false,
            content: {feedback: 'This is anonymous feedback'},
            shareWithGroup: false,
            shareWithDepartment: false,
            anonymous: true
        };

        const response = await request(server)
            .post('/docs/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send(newDocument);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('ANONYMOUS_DOCUMENTS_DISABLED');
        expect(response.body.message).toBeDefined();
    });

    test('should reject before document is created (no entry in DB)', async () => {
        const newDocument: any = {
            title: 'Anonymous Feedback',
            type: 1,
            subType: 1,
            public: false,
            content: {feedback: 'This is anonymous feedback'},
            shareWithGroup: false,
            shareWithDepartment: false,
            anonymous: true
        };

        await request(server)
            .post('/docs/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send(newDocument);

        const allDocs = await dataManager.documents.query({});
        expect(allDocs.length).toBe(0);
    });

    test('should still allow non-anonymous document creation when flag is off', async () => {
        const newDocument: any = {
            title: 'Regular Document',
            type: 1,
            subType: 1,
            public: false,
            content: {feedback: 'This is a regular document'},
            shareWithGroup: false,
            shareWithDepartment: false,
            anonymous: false
        };

        const response = await request(server)
            .post('/docs/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send(newDocument);

        expect(response.status).toBe(200);
        expect(response.body.owner).toBe(regularUser._id);
    });

    test('should still allow non-anonymous document creation when flag is omitted', async () => {
        const newDocument = {
            title: 'Regular Document',
            type: 1,
            subType: 1,
            public: false,
            content: {feedback: 'This is a regular document'},
            shareWithGroup: false,
            shareWithDepartment: false
        };

        const response = await request(server)
            .post('/docs/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send(newDocument);

        expect(response.status).toBe(200);
        expect(response.body.owner).toBe(regularUser._id);
    });
});

describe('Anonymous Document logging privacy', () => {
    test('anonymous creation should not log creator id, body, or any user-identifying info', async () => {
        const {logger, entries} = createMemoryTestLogger('debug');

        // Set up an isolated server using the memory logger
        const dataManager = new NeDbWrapper(logger, {inMemoryOnly: true}, {anonymousDocumentsEnabled: true});
        await dataManager.waitForInitialization();
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        const userToken = users.userToken;
        const creator = users.regularUser;
        await dataManager.structures.add({
            type: 1,
            subType: 1,
            name: 'Feedback Structure',
            description: 'Structure for anonymous feedback',
            fields: []
        });
        await dataManager.setAnonymousAllowed(1, 1, users.adminUser._id);

        const emailService = new EmailService(null, logger, 'http://localhost:3033');
        dataManager.setEmailService(emailService);

        const corsOptions = {origin: "http://localhost:3033", credentials: true} as unknown as I_CorsOption;
        const networkManager = new NetworkManager(logger, dataManager, 3033, corsOptions, {anonymousDocumentsEnabled: true}, emailService);
        const server = networkManager.webServer;
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const sensitiveBodyContent = 'VERY-UNIQUE-IDENTIFIER-12345-ABCDE';
            const newDocument: any = {
                title: 'Anonymous Feedback',
                type: 1,
                subType: 1,
                public: false,
                content: {feedback: sensitiveBodyContent},
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: true
            };

            const response = await request(server)
                .post('/docs/create')
                .set('Authorization', `Bearer ${userToken}`)
                .send(newDocument);

            expect(response.status).toBe(200);

            // Filter to log entries that mention the new document id. This
            // excludes unrelated entries (user creation, DB init, OIDC
            // bootstrap) and gives us a tight set to assert privacy on.
            const docId = response.body._id;
            const docEntries = entries.filter(e =>
                typeof e.message === 'string' && e.message.includes(docId)
            );
            expect(docEntries.length).toBeGreaterThan(0);
            const combined = JSON.stringify(docEntries);

            // The creator's id must not appear in any document-related log line.
            expect(combined).not.toContain(creator._id);
            // The body content and the title must not appear in any document-related log line.
            expect(combined).not.toContain(sensitiveBodyContent);
            expect(combined).not.toContain('Anonymous Feedback');
            // The creator's email must not appear in any document-related log line.
            expect(combined).not.toContain('user@example.com');
            // The stringified name property must not appear in any document-related log line.
            expect(combined).not.toContain(`"name":"${creator.name}"`);
        } finally {
            await closeTestServer(networkManager);
        }
    });

    test('non-anonymous creation should be logged at debug level (not info)', async () => {
        const {logger, entries} = createMemoryTestLogger('debug');

        const dataManager = new NeDbWrapper(logger, {inMemoryOnly: true}, {anonymousDocumentsEnabled: false});
        await dataManager.waitForInitialization();
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        const userToken = users.userToken;
        await dataManager.structures.add({
            type: 1,
            subType: 1,
            name: 'Feedback Structure',
            description: 'Structure for anonymous feedback',
            fields: []
        });

        const emailService = new EmailService(null, logger, 'http://localhost:3034');
        dataManager.setEmailService(emailService);

        const corsOptions = {origin: "http://localhost:3034", credentials: true} as unknown as I_CorsOption;
        const networkManager = new NetworkManager(logger, dataManager, 3034, corsOptions, {anonymousDocumentsEnabled: false}, emailService);
        const server = networkManager.webServer;
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const newDocument: any = {
                title: 'Regular Document',
                type: 1,
                subType: 1,
                public: false,
                content: {feedback: 'This is a regular document'},
                shareWithGroup: false,
                shareWithDepartment: false
            };

            const response = await request(server)
                .post('/docs/create')
                .set('Authorization', `Bearer ${userToken}`)
                .send(newDocument);

            expect(response.status).toBe(200);

            // Filter to log entries that contain the document id we just
            // created - this is the only reliable way to pick out the
            // "document created" log lines from user creation / DB init
            // log lines.
            const docId = response.body._id;
            const createEntries = entries.filter(e =>
                typeof e.message === 'string' && e.message.includes(docId)
            );
            expect(createEntries.length).toBeGreaterThan(0);
            for (const entry of createEntries) {
                expect(entry.level).toBe('debug');
            }
        } finally {
            await closeTestServer(networkManager);
        }
    });

    test('anonymous creation should be logged at debug level (not info)', async () => {
        const {logger, entries} = createMemoryTestLogger('debug');

        const dataManager = new NeDbWrapper(logger, {inMemoryOnly: true}, {anonymousDocumentsEnabled: true});
        await dataManager.waitForInitialization();
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        const userToken = users.userToken;
        await dataManager.structures.add({
            type: 1,
            subType: 1,
            name: 'Feedback Structure',
            description: 'Structure for anonymous feedback',
            fields: []
        });
        await dataManager.setAnonymousAllowed(1, 1, users.adminUser._id);

        const emailService = new EmailService(null, logger, 'http://localhost:3035');
        dataManager.setEmailService(emailService);

        const corsOptions = {origin: "http://localhost:3035", credentials: true} as unknown as I_CorsOption;
        const networkManager = new NetworkManager(logger, dataManager, 3035, corsOptions, {anonymousDocumentsEnabled: true}, emailService);
        const server = networkManager.webServer;
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const newDocument: any = {
                title: 'Anonymous Feedback',
                type: 1,
                subType: 1,
                public: false,
                content: {feedback: 'This is anonymous feedback'},
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: true
            };

            const response = await request(server)
                .post('/docs/create')
                .set('Authorization', `Bearer ${userToken}`)
                .send(newDocument);

            expect(response.status).toBe(200);

            // Filter to log entries that contain the document id we just
            // created - this is the only reliable way to pick out the
            // "document created" log lines from user creation / DB init
            // log lines.
            const docId = response.body._id;
            const createEntries = entries.filter(e =>
                typeof e.message === 'string' && e.message.includes(docId)
            );
            expect(createEntries.length).toBeGreaterThan(0);
            for (const entry of createEntries) {
                expect(entry.level).toBe('debug');
            }
        } finally {
            await closeTestServer(networkManager);
        }
    });
});
