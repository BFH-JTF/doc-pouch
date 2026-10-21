import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    createTestUsers,
    cleanupTestDatabase,
    closeTestServer,
    generateToken,
} from '../setup/testSetup.js';

// Roles: member < manager < admin < superadmin (isAdmin)
describe('Roles and protected structures', () => {
    let server: Server;
    let networkManager: NetworkManager;
    let dataManager: NeDbWrapper;
    let superToken: string;
    let memberToken: string;
    let managerToken: string;
    let adminToken: string;
    let member: any;
    let manager: any;
    let admin: any;

    const PROTECTED = {type: 50, subType: 1};   // e.g. import templates: manager and above
    const ADMIN_ONLY = {type: 50, subType: 0};  // e.g. tool definitions: admin and above
    const FREE = {type: 51, subType: 0};

    const doc = (t: { type: number, subType: number }, title = 'Doc') => ({
        title, type: t.type, subType: t.subType, content: {a: 1},
        shareWithGroup: true, shareWithDepartment: false, public: false,
    });

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        networkManager = setup.networkManager;
        dataManager = setup.dataManager;
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        await dataManager.protectedStructures.remove({});
        const users = await createTestUsers(dataManager);
        superToken = users.adminToken;
        member = users.regularUser;
        memberToken = users.userToken;
        manager = await dataManager.createUser({name: 'mgr', password: 'managerpassword', email: 'm@example.com', department: 'IT', group: 'Users', isAdmin: false, role: 'manager'});
        admin = await dataManager.createUser({name: 'adm', password: 'adminrolepassword', email: 'a@example.com', department: 'IT', group: 'Users', isAdmin: false, role: 'admin'});
        managerToken = generateToken(manager);
        adminToken = generateToken(admin);
        for (const t of [PROTECTED, ADMIN_ONLY, FREE]) {
            await dataManager.structures.add({...t, name: `S-${t.type}-${t.subType}`, description: '', fields: []});
        }
        await request(server).post('/structures/protected/set').set('Authorization', `Bearer ${superToken}`).send({...PROTECTED, minRole: 'manager'});
        await request(server).post('/structures/protected/set').set('Authorization', `Bearer ${superToken}`).send({...ADMIN_ONLY, minRole: 'admin'});
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    test('whoami reports the effective role', async () => {
        const r = async (t: string) => (await request(server).get('/users/whoami').set('Authorization', `Bearer ${t}`)).body.role;
        expect(await r(memberToken)).toBe('member');
        expect(await r(managerToken)).toBe('manager');
        expect(await r(adminToken)).toBe('admin');
        expect(await r(superToken)).toBe('superadmin');
    });

    test('only super-admins manage protection rules', async () => {
        const res = await request(server).post('/structures/protected/set').set('Authorization', `Bearer ${adminToken}`).send({...FREE, minRole: 'manager'});
        expect(res.status).toBe(401);
        const list = await request(server).get('/structures/protected/list').set('Authorization', `Bearer ${memberToken}`);
        expect(list.status).toBe(200);
        expect(list.body).toEqual(expect.arrayContaining([{...PROTECTED, minRole: 'manager'}, {...ADMIN_ONLY, minRole: 'admin'}]));
    });

    test('invalid minRole is rejected', async () => {
        const res = await request(server).post('/structures/protected/set').set('Authorization', `Bearer ${superToken}`).send({...FREE, minRole: 'member'});
        expect(res.status).toBe(400);
    });

    test('members may not create protected documents, managers may', async () => {
        const m = await request(server).post('/docs/create').set('Authorization', `Bearer ${memberToken}`).send(doc(PROTECTED));
        expect(m.status).toBe(403);
        expect(m.body.error).toBe('ROLE_REQUIRED_FOR_STRUCTURE');
        const g = await request(server).post('/docs/create').set('Authorization', `Bearer ${managerToken}`).send(doc(PROTECTED));
        expect(g.status).toBe(200);
    });

    test('admin-only structures need admin', async () => {
        expect((await request(server).post('/docs/create').set('Authorization', `Bearer ${managerToken}`).send(doc(ADMIN_ONLY))).status).toBe(403);
        expect((await request(server).post('/docs/create').set('Authorization', `Bearer ${adminToken}`).send(doc(ADMIN_ONLY))).status).toBe(200);
        expect((await request(server).post('/docs/create').set('Authorization', `Bearer ${superToken}`).send(doc(ADMIN_ONLY))).status).toBe(200);
    });

    test('unprotected structures stay open for members', async () => {
        expect((await request(server).post('/docs/create').set('Authorization', `Bearer ${memberToken}`).send(doc(FREE))).status).toBe(200);
    });

    test('a group member cannot change a protected document shared with the group', async () => {
        const created = await request(server).post('/docs/create').set('Authorization', `Bearer ${managerToken}`).send(doc(PROTECTED));
        const id = created.body._id;
        const upd = await request(server).patch(`/docs/update/${id}`).set('Authorization', `Bearer ${memberToken}`).send({content: {a: 2}});
        expect(upd.status).toBe(403);
        const own = await request(server).patch(`/docs/update/${id}`).set('Authorization', `Bearer ${managerToken}`).send({content: {a: 3}});
        expect(own.status).toBe(200);
    });

    test('a member cannot move a document into a protected structure', async () => {
        const created = await request(server).post('/docs/create').set('Authorization', `Bearer ${memberToken}`).send(doc(FREE));
        const upd = await request(server).patch(`/docs/update/${created.body._id}`).set('Authorization', `Bearer ${memberToken}`).send({type: PROTECTED.type, subType: PROTECTED.subType});
        expect(upd.status).toBe(403);
    });

    test('removing a protected document needs the role', async () => {
        const created = await request(server).post('/docs/create').set('Authorization', `Bearer ${managerToken}`).send(doc(PROTECTED));
        await dataManager.updateUser(manager._id, {role: 'member'});   // demoted
        const del = await request(server).delete(`/docs/remove/${created.body._id}`).set('Authorization', `Bearer ${managerToken}`);
        expect(del.status).toBe(403);
    });

    test('structures can be created by admins, not by managers', async () => {
        const s = {name: 'New', description: '', type: 60, subType: 0, fields: []};
        expect((await request(server).post('/structures/create').set('Authorization', `Bearer ${managerToken}`).send(s)).status).toBe(401);
        expect((await request(server).post('/structures/create').set('Authorization', `Bearer ${adminToken}`).send(s)).status).toBe(200);
    });

    test('users cannot give themselves a role or super-admin rights', async () => {
        const r1 = await request(server).patch(`/users/update/${member._id}`).set('Authorization', `Bearer ${memberToken}`).send({role: 'admin'});
        expect(r1.status).toBe(401);
        const r2 = await request(server).patch(`/users/update/${member._id}`).set('Authorization', `Bearer ${memberToken}`).send({isAdmin: true});
        expect(r2.status).toBe(401);
        const who = await request(server).get('/users/whoami').set('Authorization', `Bearer ${memberToken}`);
        expect(who.body.role).toBe('member');
        expect(who.body.isAdmin).toBe(false);
        // own e-mail stays editable
        const r3 = await request(server).patch(`/users/update/${member._id}`).set('Authorization', `Bearer ${memberToken}`).send({email: 'new@example.com'});
        expect(r3.status).toBe(200);
    });

    test('super-admins assign roles', async () => {
        const r = await request(server).patch(`/users/update/${member._id}`).set('Authorization', `Bearer ${superToken}`).send({role: 'manager'});
        expect(r.status).toBe(200);
        const who = await request(server).get('/users/whoami').set('Authorization', `Bearer ${memberToken}`);
        expect(who.body.role).toBe('manager');
        const bad = await request(server).patch(`/users/update/${member._id}`).set('Authorization', `Bearer ${superToken}`).send({role: 'king'});
        expect(bad.status).not.toBe(200);
    });

    test('super-admins create users with a role', async () => {
        const res = await request(server).post('/users/create').set('Authorization', `Bearer ${superToken}`).send({name: 'mgr2', password: 'managerpassword2', email: 'm2@example.com', department: 'IT', group: 'Users', isAdmin: false, role: 'manager'});
        expect(res.status).toBe(200);
        const list = await request(server).get('/users/list').set('Authorization', `Bearer ${superToken}`);
        const created = list.body.find((u: any) => u.name === 'mgr2');
        expect(created.role).toBe('manager');
    });

    test('importing protection rules in add mode does not overwrite existing rules', async () => {
        await dataManager.importProtectedStructures([{type: 51, subType: 0, minRole: 'admin'}], 'add');
        await dataManager.importProtectedStructures([{type: 51, subType: 0, minRole: 'manager'}], 'add');
        await dataManager.importProtectedStructures([{type: 51, subType: 9, minRole: 'manager'}], 'add');
        const list = await dataManager.getProtectedStructures();
        const rule = list.find((r) => r.type === 51 && r.subType === 0);
        expect(rule?.minRole).toBe('admin');
        expect(list.filter((r) => r.type === 51 && r.subType === 0).length).toBe(1);
        expect(list.filter((r) => r.type === 51 && r.subType === 9).length).toBe(1);
    });

    test('protection rules are part of the JSON export', async () => {
        const res = await request(server).get('/database/export?scope=all&format=json').set('Authorization', `Bearer ${superToken}`);
        expect(res.status).toBe(200);
        const body = JSON.parse(res.text);
        expect(body.protectedStructures).toEqual(expect.arrayContaining([expect.objectContaining({...PROTECTED, minRole: 'manager'})]));
    });
});
