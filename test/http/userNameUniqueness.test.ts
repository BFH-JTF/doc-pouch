import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupTestServer,
    closeTestServer,
    createTestUsers,
    cleanupTestDatabase,
} from '../setup/testSetup.js';

// Regression tests for #111: the duplicate-name check in updateUser
// previously rejected the request but still applied the write, allowing
// duplicate usernames and login-by-name ambiguity. createUser's
// count-then-insert had the same weakness.

describe('Username uniqueness (#111)', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;
    let adminToken: string;
    let regularUser: any;
    let regularUserToken: string;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        dataManager = setup.dataManager;
        networkManager = setup.networkManager;
    });

    afterAll(async () => {
        await closeTestServer(networkManager);
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        regularUser = users.regularUser;
        regularUserToken = users.userToken;
    });

    test('createUser rejects a duplicate name and creates nothing', async () => {
        const res = await request(server)
            .post('/users/create')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                name: 'user',
                password: 'duplicate-password-1',
                email: 'duplicate@example.com',
                department: 'IT',
                group: 'Users',
                isAdmin: false,
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already exists');

        // Exactly one user named "user" must exist afterwards.
        const listRes = await request(server)
            .get('/users/list')
            .set('Authorization', `Bearer ${adminToken}`);
        const namedUser = listRes.body.filter((u: any) => u.name === 'user');
        expect(namedUser).toHaveLength(1);
    });

    test('renaming a user to an existing name is rejected and not applied', async () => {
        const res = await request(server)
            .patch(`/users/update/${regularUser._id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({name: 'admin'});

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('already exists');

        // The rename must NOT have been applied.
        const listRes = await request(server)
            .get('/users/list')
            .set('Authorization', `Bearer ${adminToken}`);
        const updated = listRes.body.find((u: any) => u._id === regularUser._id);
        expect(updated.name).toBe('user');
        const namedAdmin = listRes.body.filter((u: any) => u.name === 'admin');
        expect(namedAdmin).toHaveLength(1);
    });

    test('a self-rename to the current name is accepted (no-op)', async () => {
        const res = await request(server)
            .patch(`/users/update/${regularUser._id}`)
            .set('Authorization', `Bearer ${regularUserToken}`)
            .send({name: 'user'});

        expect(res.status).toBe(200);

        const listRes = await request(server)
            .get('/users/list')
            .set('Authorization', `Bearer ${adminToken}`);
        const namedUser = listRes.body.filter((u: any) => u.name === 'user');
        expect(namedUser).toHaveLength(1);
    });

    test('data layer: a duplicate rename is rejected without any write', async () => {
        await expect(dataManager.updateUser(regularUser._id, {name: 'admin'}))
            .rejects.toThrow(/already exists/);

        // Names must be untouched after the failed update.
        const stillRegular = await dataManager.validateUser('user', 'userpassword');
        expect(typeof stillRegular).toBe('object');
        const stillOnlyOneAdmin = await dataManager.validateUser('admin', 'adminpassword');
        expect(typeof stillOnlyOneAdmin).toBe('object');
        // The regular user's credentials must not unlock the admin name.
        const crossLogin = await dataManager.validateUser('admin', 'userpassword');
        expect(crossLogin).toBe(401);
    });
});