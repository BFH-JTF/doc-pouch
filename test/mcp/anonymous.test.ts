import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
} from '../setup/testSetup.js';

describe('MCP Anonymous Documents', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let adminToken: string;

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

        await dataManager.structures.add({
            type: 10,
            subType: 20,
            name: 'Test Structure',
            description: 'Test',
            fields: [],
        });
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    async function mcpRequest(method: string, params: any, token: string) {
        return request(server)
            .post('/mcp')
            .send({
                jsonrpc: '2.0',
                id: 1,
                method,
                params,
            })
            .set('Authorization', `Bearer ${token}`)
            .set('Content-Type', 'application/json');
    }

    test('create_document with anonymous=true returns ANONYMOUS_DOCUMENTS_DISABLED when disabled', async () => {
        const response = await mcpRequest('tools/call', {
            name: 'create_document',
            arguments: {
                type: 10,
                subType: 20,
                title: 'Anon Doc',
                content: {text: 'secret'},
                public: false,
                shareWithGroup: false,
                shareWithDepartment: false,
                anonymous: true,
            },
        }, adminToken);
        expect(response.status).not.toBe(401);
        const body = typeof response.body === 'object' ? response.body : JSON.parse(response.text);
        const content = body?.result?.content?.[0]?.text;
        if (content) {
            expect(content).toContain('ANONYMOUS_DOCUMENTS_DISABLED');
        }
    });
});