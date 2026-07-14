import {Server} from 'http';
import {io, Socket} from 'socket.io-client';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    API_BASE_URL, waitForEvent, authenticatedRequest
} from '../setup/testSetup.js';

describe('Database Import WebSocket Events', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;
    let userToken: string;
    let adminSocket: Socket;
    let userSocket: Socket;
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

        adminSocket = io(API_BASE_URL, {
            auth: {token: adminToken},
            reconnection: false,
            forceNew: true,
            transports: ['websocket']
        });
        userSocket = io(API_BASE_URL, {
            auth: {token: userToken},
            reconnection: false,
            forceNew: true,
            transports: ['websocket']
        });

        await Promise.all([
            new Promise<void>((resolve) => adminSocket.on('connect', () => resolve())),
            new Promise<void>((resolve) => userSocket.on('connect', () => resolve()))
        ]);
    });

    afterEach(() => {
        if (adminSocket?.connected) adminSocket.disconnect();
        if (userSocket?.connected) userSocket.disconnect();
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('mode=replace on empty target emits newStructure and newDocument to all clients', async () => {
        const adminStructPromise = waitForEvent(adminSocket, 'newStructure');
        const userStructPromise = waitForEvent(userSocket, 'newStructure');
        const adminDocPromise = waitForEvent(adminSocket, 'newDocument');
        const userDocPromise = waitForEvent(userSocket, 'newDocument');

        const exportPayload = {
            users: [],
            documents: [
                {
                    _id: 'ImportedDoc000001',
                    title: 'Imported',
                    type: 1,
                    subType: 1,
                    shareWithGroup: true,
                    shareWithDepartment: true,
                    public: true,
                    owner: adminUser._id,
                    content: {hello: 'world'},
                },
            ],
            structures: [
                {
                    _id: 'ImportedStruct0001',
                    name: 'Imported Structure',
                    description: 'test',
                    type: 1,
                    subType: 1,
                    fields: [],
                },
            ],
        };

        const response = await authenticatedRequest(server, adminToken)
            .post('/database/import')
            .field('scope', 'all')
            .field('mode', 'replace')
            .attach('file', Buffer.from(JSON.stringify(exportPayload)), {
                filename: 'export.json',
                contentType: 'application/json',
            });

        expect(response.status).toBe(200);

        const [adminStruct, userStruct, adminDoc, userDoc] = await Promise.all([
            adminStructPromise,
            userStructPromise,
            adminDocPromise,
            userDocPromise,
        ]);

        expect(adminStruct.newStructure._id).toBe('ImportedStruct0001');
        expect(userStruct.newStructure._id).toBe('ImportedStruct0001');
        expect(adminDoc.newDocument._id).toBe('ImportedDoc000001');
        expect(userDoc.newDocument._id).toBe('ImportedDoc000001');
    });

    test('mode=replace onto an existing record emits changedDocument to accessors', async () => {
        // Pre-seed a document that will be overwritten by the import.
        const existing = await dataManager.documents.add({
            _id: 'ExistingDoc000001',
            title: 'Original',
            type: 1,
            subType: 1,
            shareWithGroup: true,
            shareWithDepartment: true,
            public: true,
            owner: adminUser._id,
            content: {marker: 'original'},
        });
        expect(existing._id).toBe('ExistingDoc000001');

        const adminChangedPromise = waitForEvent(adminSocket, 'changedDocument');
        const userChangedPromise = waitForEvent(userSocket, 'changedDocument');

        const exportPayload = {
            users: [],
            documents: [
                {
                    _id: 'ExistingDoc000001',
                    title: 'Replaced',
                    type: 1,
                    subType: 1,
                    shareWithGroup: true,
                    shareWithDepartment: true,
                    public: true,
                    owner: adminUser._id,
                    content: {marker: 'replaced'},
                },
            ],
            structures: [],
        };

        const response = await authenticatedRequest(server, adminToken)
            .post('/database/import')
            .field('scope', 'all')
            .field('mode', 'replace')
            .attach('file', Buffer.from(JSON.stringify(exportPayload)), {
                filename: 'export.json',
                contentType: 'application/json',
            });

        expect(response.status).toBe(200);

        const [adminData, userData] = await Promise.all([adminChangedPromise, userChangedPromise]);
        expect(adminData.changedDocument._id).toBe('ExistingDoc000001');
        expect(adminData.changedDocument.title).toBe('Replaced');
        expect(userData.changedDocument._id).toBe('ExistingDoc000001');
    });

    test('mode=add emits newUser event to admins (but not to non-admins)', async () => {
        const adminNewUserPromise = waitForEvent(adminSocket, 'newUser');
        // Track whether userSocket receives newUser. We use a flag so the
        // test can assert non-admins do not see the event.
        let userGotNewUser = false;
        userSocket.once('newUser', () => {
            userGotNewUser = true;
        });

        const exportPayload = {
            users: [
                {
                    _id: 'NewUser0000000001',
                    name: 'imported_admin',
                    password: 'importedpass',
                    email: 'newadmin@example.com',
                    department: 'IT',
                    group: 'Users',
                    isAdmin: true,
                },
            ],
            documents: [],
            structures: [],
        };

        const response = await authenticatedRequest(server, adminToken)
            .post('/database/import')
            .field('scope', 'all')
            .field('mode', 'add')
            .attach('file', Buffer.from(JSON.stringify(exportPayload)), {
                filename: 'export.json',
                contentType: 'application/json',
            });

        expect(response.status).toBe(200);

        const adminData = await adminNewUserPromise;
        expect(adminData.newUser.name).toBe('imported_admin');
        // The new user was created with a different _id because mode=add
        // strips the source id.
        expect(adminData.newUser._id).not.toBe('NewUser0000000001');

        // Give the user socket a brief window to receive the event; since
        // it should not, we just check the flag.
        await new Promise(r => setTimeout(r, 200));
        expect(userGotNewUser).toBe(false);
    });
});
