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

describe('Anonymous Structure Allowlist API Tests', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminUser: any;
    let regularUser: any;

    beforeAll(async () => {
        const setup = await setupTestServer({anonymousDocumentsEnabled: true});
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

        await dataManager.structures.add({
            type: 1,
            subType: 1,
            name: 'Feedback Structure',
            description: 'Structure for anonymous feedback',
            fields: []
        });

        await dataManager.structures.add({
            type: 2,
            subType: 1,
            name: 'Survey Structure',
            description: 'Structure for surveys',
            fields: []
        });
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    describe('GET /structures/anonymous/list', () => {
        test('should return empty list by default', async () => {
            const response = await request(server)
                .get('/structures/anonymous/list')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('should return allowlist entries after adding', async () => {
            await request(server)
                .post('/structures/anonymous/set')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({type: 1, subType: 1});

            const response = await request(server)
                .get('/structures/anonymous/list')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(1);
            expect(response.body[0].type).toBe(1);
            expect(response.body[0].subType).toBe(1);
        });

        test('should be accessible by non-admin users', async () => {
            const response = await request(server)
                .get('/structures/anonymous/list')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('POST /structures/anonymous/set', () => {
        test('should add an entry to the allowlist as admin', async () => {
            const response = await request(server)
                .post('/structures/anonymous/set')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({type: 1, subType: 1});

            expect(response.status).toBe(200);
            expect(response.body.type).toBe(1);
            expect(response.body.subType).toBe(1);
            expect(response.body._id).toBeDefined();
        });

        test('should reject non-admin users', async () => {
            const response = await request(server)
                .post('/structures/anonymous/set')
                .set('Authorization', `Bearer ${userToken}`)
                .send({type: 1, subType: 1});

            expect(response.status).toBe(401);
        });

        test('should return existing entry if already in allowlist', async () => {
            await request(server)
                .post('/structures/anonymous/set')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({type: 1, subType: 1});

            const response = await request(server)
                .post('/structures/anonymous/set')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({type: 1, subType: 1});

            expect(response.status).toBe(200);
        });

        test('should reject invalid data', async () => {
            const response = await request(server)
                .post('/structures/anonymous/set')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({type: 'not-a-number'});

            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /structures/anonymous/remove', () => {
        test('should remove an entry from the allowlist as admin', async () => {
            await request(server)
                .post('/structures/anonymous/set')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({type: 1, subType: 1});

            const response = await request(server)
                .delete('/structures/anonymous/remove')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({type: 1, subType: 1});

            expect(response.status).toBe(200);
            expect(response.body.removed).toBeGreaterThanOrEqual(1);

            const listResponse = await request(server)
                .get('/structures/anonymous/list')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(listResponse.body).toHaveLength(0);
        });

        test('should reject non-admin users', async () => {
            const response = await request(server)
                .delete('/structures/anonymous/remove')
                .set('Authorization', `Bearer ${userToken}`)
                .send({type: 1, subType: 1});

            expect(response.status).toBe(401);
        });

        test('should return 0 removed for non-existent entry', async () => {
            const response = await request(server)
                .delete('/structures/anonymous/remove')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({type: 99, subType: 99});

            expect(response.status).toBe(200);
            expect(response.body.removed).toBe(0);
        });
    });
});

describe('Anonymous document creation with per-structure allowlist', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        const setup = await setupTestServer({anonymousDocumentsEnabled: true});
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        userToken = users.userToken;

        await dataManager.structures.add({
            type: 1,
            subType: 1,
            name: 'Allowed Structure',
            description: 'Structure that allows anonymous creation',
            fields: []
        });

        await dataManager.structures.add({
            type: 2,
            subType: 1,
            name: 'Disallowed Structure',
            description: 'Structure that does not allow anonymous creation',
            fields: []
        });
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('should create anonymous document when structure is in allowlist', async () => {
        await request(server)
            .post('/structures/anonymous/set')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({type: 1, subType: 1});

        const response = await request(server)
            .post('/docs/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                title: 'Anonymous Feedback',
                type: 1,
                subType: 1,
                public: false,
                content: {feedback: 'This is anonymous feedback'},
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: true
            });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('_id');
        const adminUser = await dataManager.getUserByID(response.body.owner);
        expect(adminUser.name).toBe('admin');
    });

    test('should reject anonymous document when structure is NOT in allowlist', async () => {
        const response = await request(server)
            .post('/docs/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                title: 'Anonymous Feedback',
                type: 2,
                subType: 1,
                public: false,
                content: {feedback: 'This is anonymous feedback'},
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: true
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('ANONYMOUS_NOT_ALLOWED_FOR_STRUCTURE');
    });

    test('should create non-anonymous document regardless of allowlist', async () => {
        const response = await request(server)
            .post('/docs/create')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                title: 'Regular Document',
                type: 2,
                subType: 1,
                public: false,
                content: {text: 'Regular document'},
                shareWithGroup: false,
                shareWithDepartment: false
            });

        expect(response.status).toBe(200);
    });

    test('should reject anonymous document when global flag is off', async () => {
        const {logger} = createMemoryTestLogger('debug');
        const disabledDm = new NeDbWrapper(logger, {inMemoryOnly: true}, {anonymousDocumentsEnabled: false});
        await disabledDm.waitForInitialization();
        const disabledEmailService = new EmailService(null, logger, 'http://localhost:3036');
        disabledDm.setEmailService(disabledEmailService);
        await cleanupTestDatabase(disabledDm);
        const disabledUsers = await createTestUsers(disabledDm);

        const disabledCors: I_CorsOption = {
            origin: '*',
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Socket-ID']
        };
        const disabledNm = new NetworkManager(logger, disabledDm, 3036, disabledCors, {anonymousDocumentsEnabled: false}, disabledEmailService);
        const disabledServer = disabledNm.webServer;
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const response = await request(disabledServer)
                .post('/docs/create')
                .set('Authorization', `Bearer ${disabledUsers.adminToken}`)
                .send({
                    title: 'Anonymous Feedback',
                    type: 1,
                    subType: 1,
                    public: false,
                    content: {feedback: 'This is anonymous feedback'},
                    shareWithGroup: false,
                    shareWithDepartment: false,
                    anonymous: true
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('ANONYMOUS_DOCUMENTS_DISABLED');
        } finally {
            await closeTestServer(disabledNm);
        }
    });

    test('should auto-remove allowlist entry when structure is deleted', async () => {
        await request(server)
            .post('/structures/anonymous/set')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({type: 1, subType: 1});

        const listBefore = await request(server)
            .get('/structures/anonymous/list')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(listBefore.body).toHaveLength(1);

        const structures = await dataManager.getStructures();
        const structureToDelete = structures.find((s: any) => s.type === 1 && s.subType === 1);

        await request(server)
            .delete(`/structures/remove/${structureToDelete!._id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        const listAfter = await request(server)
            .get('/structures/anonymous/list')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(listAfter.body).toHaveLength(0);
    });
});