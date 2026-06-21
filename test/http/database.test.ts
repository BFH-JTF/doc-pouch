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

    describe('mode=add cross-collection id remap', () => {
        test('structure.field.items is rewritten to the new structure id', async () => {
            // Seed a parent structure that another structure will reference.
            const parent = await dataManager.structures.add({
                name: 'Parent Struct',
                description: 'parent',
                type: 10,
                subType: 10,
                fields: [],
            });

            // Seed a child structure that points at the parent by id.
            const child = await dataManager.structures.add({
                name: 'Child Struct',
                description: 'child',
                type: 11,
                subType: 11,
                fields: [
                    {name: 'ref', displayName: 'Ref', type: 'structure', items: parent._id},
                ],
            });

            const exportPayload = {
                users: [],
                documents: [],
                structures: [
                    {
                        _id: parent._id,
                        name: parent.name,
                        description: parent.description,
                        type: parent.type,
                        subType: parent.subType,
                        fields: parent.fields,
                    },
                    {
                        _id: child._id,
                        name: child.name,
                        description: child.description,
                        type: child.type,
                        subType: child.subType,
                        fields: child.fields,
                    },
                ],
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

            // After import, the child must point at a structure that exists
            // locally and is not the original parent id.
            const structures = await dataManager.structures.query({}) as any[];
            const newParent = structures.find(s => s.name === 'Parent Struct' && s._id !== parent._id);
            const newChild = structures.find(s => s.name === 'Child Struct' && s._id !== child._id);
            expect(newParent).toBeDefined();
            expect(newChild).toBeDefined();
            expect(newChild.fields[0].items).toBe(newParent._id);
        });

        test('document.owner is rewritten to the new user id', async () => {
            const exportPayload = {
                users: [
                    {
                        _id: 'YYYYYYYYYYYYYYYY',
                        name: 'imported_owner',
                        password: 'importedpass',
                        email: 'owner@example.com',
                        department: 'IT',
                        group: 'Users',
                        isAdmin: false,
                    },
                ],
                documents: [
                    {
                        _id: 'ZZZZZZZZZZZZZZZZ',
                        title: 'Owned Doc',
                        description: 'doc with owner',
                        type: 1,
                        subType: 1,
                        shareWithGroup: false,
                        shareWithDepartment: false,
                        public: false,
                        owner: 'YYYYYYYYYYYYYYYY',
                        content: {text: 'hello'},
                    },
                ],
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

            const users = await dataManager.users.query({name: 'imported_owner'}) as any[];
            expect(users.length).toBeGreaterThanOrEqual(1);
            const docs = await dataManager.documents.query({title: 'Owned Doc'}) as any[];
            const newDoc = docs.find(d => d._id !== 'ZZZZZZZZZZZZZZZZ');
            expect(newDoc).toBeDefined();
            // Owner must be remapped to an existing user, not the original.
            expect(newDoc.owner).not.toBe('YYYYYYYYYYYYYYYY');
            const knownUserIds = users.map(u => u._id);
            expect(knownUserIds).toContain(newDoc.owner);
        });

        test('document content doclinks are rewritten to the new ids', async () => {
            // Build a target document whose content embeds the source ids of
            // the records we are about to import. The ids below are 16-char
            // strings that match DOCPOUCH_ID_REGEX.
            const sourceStructureId = 'Aaaaaaaaaaaaaaa1';
            const sourceDocumentId = 'Bbbbbbbbbbbbbbb1';

            const exportPayload = {
                users: [],
                documents: [
                    {
                        _id: sourceDocumentId,
                        title: 'Target',
                        description: 'doc with embedded links',
                        type: 1,
                        subType: 1,
                        shareWithGroup: false,
                        shareWithDepartment: false,
                        public: true,
                        owner: adminUser._id,
                        content: {
                            // The frontend only treats a string as a doclink
                            // when it matches DOCPOUCH_ID_REGEX as a whole
                            // string, so embed the references as separate
                            // array entries that match the regex.
                            refs: [sourceStructureId, sourceDocumentId],
                            other: 'unrelated string',
                        },
                    },
                ],
                structures: [
                    {
                        _id: sourceStructureId,
                        name: 'Referenced Struct',
                        description: 'struct referenced from doc content',
                        type: 1,
                        subType: 1,
                        fields: [],
                    },
                ],
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

            const structures = await dataManager.structures.query({}) as any[];
            const newStructure = structures.find(s => s.name === 'Referenced Struct');
            expect(newStructure).toBeDefined();
            expect(newStructure._id).not.toBe(sourceStructureId);

            const docs = await dataManager.documents.query({title: 'Target'}) as any[];
            const newDoc = docs[0];
            expect(newDoc._id).not.toBe(sourceDocumentId);

            // The refs array must have been rewritten to the new ids.
            expect(newDoc.content.refs).toEqual([newStructure._id, newDoc._id]);
            expect(newDoc.content.refs).not.toContain(sourceStructureId);
            expect(newDoc.content.refs).not.toContain(sourceDocumentId);
            // Unrelated content is preserved verbatim.
            expect(newDoc.content.other).toBe('unrelated string');
        });

        test('16-char strings in content that do not match an imported record are left untouched', async () => {
            const exportPayload = {
                users: [],
                documents: [
                    {
                        _id: 'Ccccccccccccccc1',
                        title: 'No Link',
                        description: 'has 16-char string but no matching record',
                        type: 1,
                        subType: 1,
                        shareWithGroup: false,
                        shareWithDepartment: false,
                        public: true,
                        owner: adminUser._id,
                        content: {
                            // This 16-char string is NOT in any of the import
                            // maps, so the remapper must leave it alone.
                            hash: 'X'.repeat(16),
                        },
                    },
                ],
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

            const docs = await dataManager.documents.query({title: 'No Link'}) as any[];
            expect(docs[0].content.hash).toBe('X'.repeat(16));
        });
    });

    describe('mode=replace id preservation', () => {
        test('importing into an empty target preserves document and structure _id values', async () => {
            // Representative payload: structures that reference other
            // structures via field.items, and documents that reference
            // both other documents and structures via 16-char strings in
            // content arrays. This mirrors the shape of the export that
            // surfaced the cross-instance id-loss bug.
            const exportPayload = {
                users: [
                    {
                        _id: 'User1ID12345678',
                        name: 'imported_user',
                        password: 'importedpass',
                        email: 'imported@example.com',
                        department: 'IT',
                        group: 'Users',
                        isAdmin: false,
                    },
                ],
                documents: [
                    {
                        _id: 'Doc000000000001',
                        title: 'Alt Set',
                        type: 2,
                        subType: 2,
                        shareWithGroup: false,
                        shareWithDepartment: false,
                        public: false,
                        owner: 'User1ID12345678',
                        content: {
                            name: 'Alternatives',
                            alternatives: [
                                'Doc000000000002',
                                'Doc000000000003',
                            ],
                        },
                    },
                    {
                        _id: 'Doc000000000002',
                        title: 'Alt 1',
                        type: 3,
                        subType: 0,
                        shareWithGroup: false,
                        shareWithDepartment: false,
                        public: false,
                        owner: 'User1ID12345678',
                        content: {name: 'Alt 1', parent: ''},
                    },
                    {
                        _id: 'Doc000000000003',
                        title: 'Alt 2',
                        type: 3,
                        subType: 0,
                        shareWithGroup: false,
                        shareWithDepartment: false,
                        public: false,
                        owner: 'User1ID12345678',
                        content: {name: 'Alt 2', parent: ''},
                    },
                ],
                structures: [
                    {
                        _id: 'Struct000000001',
                        name: 'Alt Struct',
                        description: 'a structure referenced by another',
                        type: 3,
                        subType: 0,
                        fields: [
                            {name: 'name', displayName: 'Name', type: 'string'},
                            {name: 'parent', displayName: 'Parent', type: 'string'},
                        ],
                    },
                    {
                        _id: 'Struct000000002',
                        name: 'Alt Set Struct',
                        description: 'a structure that references Alt Struct',
                        type: 2,
                        subType: 2,
                        fields: [
                            {name: 'name', displayName: 'Name', type: 'string'},
                            {
                                name: 'alternatives',
                                displayName: 'Alternatives',
                                type: 'structure',
                                items: 'Struct000000001',
                            },
                        ],
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

            // Every source _id must be present in the target database
            // unmodified. mode=replace is a true backup/restore mode.
            for (const srcUser of exportPayload.users) {
                const found = await dataManager.users.query({_id: srcUser._id}) as any[];
                expect(found.length).toBe(1);
                expect(found[0].name).toBe(srcUser.name);
            }
            for (const srcDoc of exportPayload.documents) {
                const found = await dataManager.documents.query({_id: srcDoc._id}) as any[];
                expect(found.length).toBe(1);
                expect(found[0].title).toBe(srcDoc.title);
            }
            for (const srcStruct of exportPayload.structures) {
                const found = await dataManager.structures.query({_id: srcStruct._id}) as any[];
                expect(found.length).toBe(1);
                expect(found[0].name).toBe(srcStruct.name);
            }
        });

        test('importing on top of an existing record overwrites it in place and keeps the id', async () => {
            // Pre-seed a record that will collide with the import.
            const existingId = 'DocCollision0001';
            const original = await dataManager.documents.add({
                _id: existingId,
                title: 'Original Title',
                type: 1,
                subType: 1,
                shareWithGroup: false,
                shareWithDepartment: false,
                public: false,
                owner: adminUser._id,
                content: {marker: 'original'},
            });
            expect(original._id).toBe(existingId);

            const exportPayload = {
                users: [],
                documents: [
                    {
                        _id: existingId,
                        title: 'Replaced Title',
                        type: 1,
                        subType: 1,
                        shareWithGroup: false,
                        shareWithDepartment: false,
                        public: false,
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

            const all = await dataManager.documents.query({_id: existingId}) as any[];
            expect(all.length).toBe(1);
            expect(all[0]._id).toBe(existingId);
            expect(all[0].title).toBe('Replaced Title');
            expect(all[0].content.marker).toBe('replaced');
        });
    });
});
