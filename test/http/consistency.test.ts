import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
} from '../setup/testSetup.js';
import type {I_UserEntry} from "docpouch-client";

describe('Database Consistency Check', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        dataManager = setup.dataManager;
        networkManager = setup.networkManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        await createTestUsers(dataManager);
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('should identify documents with invalid owners', async () => {
        // Create a document with a non-existent owner
        const faultyDoc = {
            title: 'Faulty Doc',
            owner: 'non-existent-id',
            type: 1,
            subType: 1,
            content: []
        };
        await dataManager.documents.add(faultyDoc);

        const faultyDocs = await dataManager.checkDatabaseConsistency();
        expect(faultyDocs.length).toBe(1);
        expect(faultyDocs[0].title).toBe('Faulty Doc');
    });

    test('should identify documents with invalid structure type/subtype', async () => {
        const users = await dataManager.users.query({}) as I_UserEntry[];
        const adminId = users.find(u => u.name === 'admin')?._id;
        expect(adminId).toBeDefined();

        // Create a document with an invalid structure type/subtype
        const faultyDoc = {
            title: 'Faulty Structure Doc',
            owner: adminId!,
            type: 999,
            subType: 999,
            content: []
        };
        await dataManager.documents.add(faultyDoc);

        const faultyDocs = await dataManager.checkDatabaseConsistency();
        expect(faultyDocs.length).toBe(1);
        expect(faultyDocs[0].title).toBe('Faulty Structure Doc');
    });

    test('should NOT identify valid documents', async () => {
        const users = await dataManager.users.query({}) as I_UserEntry[];
        const adminId = users.find(u => u.name === 'admin')?._id;
        expect(adminId).toBeDefined();

        // Add a valid structure carrying the document classification
        await dataManager.structures.add({
            name: 'Valid Structure',
            description: 'Valid structure for consistency checks',
            type: 1,
            subType: 1,
            fields: []
        });

        const validDoc = {
            title: 'Valid Doc',
            owner: adminId!,
            type: 1,
            subType: 1,
            content: []
        };
        await dataManager.documents.add(validDoc);

        const faultyDocs = await dataManager.checkDatabaseConsistency();
        expect(faultyDocs.length).toBe(0);
    });
});
