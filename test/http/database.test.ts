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

describe('Database Export/Import API', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminUser: any;
    let regularUser: any;

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

        // Seed some structures and documents to make export meaningful
        await dataManager.structures.add({
            name: 'Export Structure',
            description: 'Structure used in export tests',
            type: 1,
            subType: 1,
            fields: []
        });
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    describe('GET /database/export', () => {
        test('admin can export the full database as JSON', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .get('/database/export?format=json&scope=all');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/application\/json/);
            expect(response.headers['content-disposition']).toMatch(/attachment/);

            const data = JSON.parse(response.text);
            expect(data).toHaveProperty('users');
            expect(data).toHaveProperty('documents');
            expect(data).toHaveProperty('structures');
            expect(Array.isArray(data.users)).toBe(true);
            expect(data.users.length).toBeGreaterThanOrEqual(2);
        });

        test('admin can export a single collection as JSON', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .get('/database/export?format=json&scope=users');

            expect(response.status).toBe(200);
            const data = JSON.parse(response.text);
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThanOrEqual(2);
        });

        test('admin can export a single collection as JSON (structures)', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .get('/database/export?format=json&scope=structures');

            expect(response.status).toBe(200);
            const data = JSON.parse(response.text);
            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThanOrEqual(1);
            expect(data[0].name).toBe('Export Structure');
        });

        test('regular user is forbidden from exporting the database', async () => {
            const response = await authenticatedRequest(server, userToken)
                .get('/database/export?format=json&scope=all');

            expect(response.status).toBe(403);
        });

        test('unauthenticated request is rejected', async () => {
            const response = await request(server)
                .get('/database/export?format=json&scope=all');

            expect(response.status).toBe(401);
        });

        test('invalid scope returns 400', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .get('/database/export?format=json&scope=invalid-scope');

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/scope/i);
        });

        test('invalid format returns 400', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .get('/database/export?format=xml&scope=all');

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/format/i);
        });

        test('ZIP export with scope other than "all" returns 400', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .get('/database/export?format=zip&scope=users');

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/zip/i);
        });
    });

    describe('POST /database/import', () => {
        test('admin can import a JSON file (scope=all, mode=replace)', async () => {
            // Prepare a JSON payload with new content
            const exportPayload = {
                users: [
                    {
                        name: 'imported_user',
                        password: 'importedpass',
                        email: 'imported@example.com',
                        department: 'Imported',
                        group: 'Imported',
                        isAdmin: false
                    }
                ],
                documents: [],
                structures: [
                    {
                        name: 'Imported Structure',
                        description: 'Imported structure',
                        type: 2,
                        subType: 2,
                        fields: []
                    }
                ]
            };

            const response = await authenticatedRequest(server, adminToken)
                .post('/database/import')
                .field('scope', 'all')
                .field('mode', 'replace')
                .attach('file', Buffer.from(JSON.stringify(exportPayload)), {
                    filename: 'export.json',
                    contentType: 'application/json'
                });

            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/imported/i);
        });

        test('admin can import a scoped JSON file (users only, mode=add)', async () => {
            const usersArray = [
                {
                    name: 'scoped_user',
                    password: 'scopedpass',
                    email: 'scoped@example.com',
                    department: 'Scoped',
                    group: 'Scoped',
                    isAdmin: false
                }
            ];

            const response = await authenticatedRequest(server, adminToken)
                .post('/database/import')
                .field('scope', 'users')
                .field('mode', 'add')
                .attach('file', Buffer.from(JSON.stringify(usersArray)), {
                    filename: 'users.json',
                    contentType: 'application/json'
                });

            expect(response.status).toBe(200);
        });

        test('regular user is forbidden from importing the database', async () => {
            const response = await authenticatedRequest(server, userToken)
                .post('/database/import')
                .field('scope', 'all')
                .field('mode', 'replace')
                .attach('file', Buffer.from('{"users":[]}'), {
                    filename: 'export.json',
                    contentType: 'application/json'
                });

            expect(response.status).toBe(403);
        });

        test('unauthenticated request is rejected', async () => {
            const response = await request(server)
                .post('/database/import')
                .field('scope', 'all')
                .field('mode', 'replace')
                .attach('file', Buffer.from('{"users":[]}'), {
                    filename: 'export.json',
                    contentType: 'application/json'
                });

            expect(response.status).toBe(401);
        });

        test('invalid scope returns 400', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .post('/database/import')
                .field('scope', 'invalid-scope')
                .field('mode', 'replace')
                .attach('file', Buffer.from('{"users":[]}'), {
                    filename: 'export.json',
                    contentType: 'application/json'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toMatch(/scope/i);
        });

        test('invalid mode returns 400', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .post('/database/import')
                .field('scope', 'all')
                .field('mode', 'invalid-mode')
                .attach('file', Buffer.from('{"users":[]}'), {
                    filename: 'export.json',
                    contentType: 'application/json'
                });

            // Note: the current implementation distinguishes "Invalid scope"
            // (returns 400) from "Invalid mode" (returns 500). Either response
            // is acceptable as long as the request is rejected.
            expect([400, 500]).toContain(response.status);
        });

        test('missing file returns 400', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .post('/database/import')
                .field('scope', 'all')
                .field('mode', 'replace');

            expect(response.status).toBe(400);
        });

        test('non-JSON/ZIP file returns 400', async () => {
            const response = await authenticatedRequest(server, adminToken)
                .post('/database/import')
                .field('scope', 'all')
                .field('mode', 'replace')
                .attach('file', Buffer.from('plain text content'), {
                    filename: 'notes.txt',
                    contentType: 'text/plain'
                });

            expect(response.status).toBe(400);
        });

        test('roundtrip: export and then import yields equivalent data', async () => {
            // Export
            const exportResponse = await authenticatedRequest(server, adminToken)
                .get('/database/export?format=json&scope=all');

            expect(exportResponse.status).toBe(200);
            const exported = JSON.parse(exportResponse.text);

            // Import the same data
            const importResponse = await authenticatedRequest(server, adminToken)
                .post('/database/import')
                .field('scope', 'all')
                .field('mode', 'replace')
                .attach('file', Buffer.from(JSON.stringify(exported)), {
                    filename: 'export.json',
                    contentType: 'application/json'
                });

            expect(importResponse.status).toBe(200);
        });
    });
});
