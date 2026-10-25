import request from 'supertest';
import {Server} from 'http';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {passwordInResponseAllowed} from '../../src/srv/EmailService.js';
import {
    setupTestServer,
    closeTestServer,
    createTestUsers,
    cleanupTestDatabase,
} from '../setup/testSetup.js';

// Regression tests for #114: generated passwords may only be returned in
// API responses when the operator explicitly opts in via
// PASSWORD_IN_RESPONSE=true. By default, user creation / password resets
// without a working email channel are refused — before anything is
// written, or rolled back when delivery fails at runtime.

const PASSWORD_IN_RESPONSE_SNAPSHOT = process.env.PASSWORD_IN_RESPONSE;

describe('Password response gating (#114)', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;
    let adminToken: string;
    let regularUser: any;

    beforeAll(async () => {
        const setup = await setupTestServer();
        server = setup.server;
        dataManager = setup.dataManager;
        networkManager = setup.networkManager;
    });

    afterAll(async () => {
        process.env.PASSWORD_IN_RESPONSE = PASSWORD_IN_RESPONSE_SNAPSHOT;
        await closeTestServer(networkManager);
    });

    beforeEach(async () => {
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        adminToken = users.adminToken;
        regularUser = users.regularUser;
    });

    afterEach(() => {
        process.env.PASSWORD_IN_RESPONSE = PASSWORD_IN_RESPONSE_SNAPSHOT;
    });

    test('unit: passwordInResponseAllowed is off by default and honors the env var', () => {
        expect(passwordInResponseAllowed({} as NodeJS.ProcessEnv)).toBe(false);
        expect(passwordInResponseAllowed({PASSWORD_IN_RESPONSE: 'true'} as NodeJS.ProcessEnv)).toBe(true);
        expect(passwordInResponseAllowed({PASSWORD_IN_RESPONSE: 'yes'} as NodeJS.ProcessEnv)).toBe(false);
    });

    describe('default (PASSWORD_IN_RESPONSE unset)', () => {
        beforeEach(() => {
            delete process.env.PASSWORD_IN_RESPONSE;
        });

        test('user creation without an email channel is refused and nothing is written', async () => {
            // SMTP is unconfigured in the test environment, so the
            // auto-generated password cannot be delivered.
            const res = await request(server)
                .post('/users/create')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'no-channel',
                    email: 'no-channel@example.com',
                    department: 'IT',
                    group: 'Users',
                    isAdmin: false,
                });

            expect(res.status).toBe(503);
            expect(res.body.error).toContain('PASSWORD_IN_RESPONSE');

            const listRes = await request(server)
                .get('/users/list')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(listRes.body.find((u: any) => u.name === 'no-channel')).toBeUndefined();
        });

        test('user creation with an explicit password succeeds and never echoes it', async () => {
            const res = await request(server)
                .post('/users/create')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'explicit-pw',
                    password: 'explicitpassword1',
                    email: 'explicit@example.com',
                    department: 'IT',
                    group: 'Users',
                    isAdmin: false,
                });

            expect(res.status).toBe(200);
            expect(res.body).not.toHaveProperty('password');

            const login = await request(server)
                .post('/users/login')
                .send({name: 'explicit-pw', password: 'explicitpassword1'});
            expect(login.status).toBe(200);
        });

        test('admin password reset without an email channel is refused and the password is untouched', async () => {
            const res = await request(server)
                .post(`/users/admin-reset-password/${regularUser._id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(503);
            expect(res.body.error).toContain('PASSWORD_IN_RESPONSE');

            // The old password still works.
            const login = await request(server)
                .post('/users/login')
                .send({name: 'user', password: 'userpassword'});
            expect(login.status).toBe(200);
        });
    });

    describe('opt-in (PASSWORD_IN_RESPONSE=true)', () => {
        beforeEach(() => {
            process.env.PASSWORD_IN_RESPONSE = 'true';
        });

        test('user creation falls back to returning the password in the response', async () => {
            const res = await request(server)
                .post('/users/create')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'fallback-user',
                    email: 'fallback@example.com',
                    department: 'IT',
                    group: 'Users',
                    isAdmin: false,
                });

            expect(res.status).toBe(200);
            expect(typeof res.body.password).toBe('string');
            expect(res.body.password.length).toBeGreaterThanOrEqual(8);

            const login = await request(server)
                .post('/users/login')
                .send({name: 'fallback-user', password: res.body.password});
            expect(login.status).toBe(200);
        });

        test('admin password reset falls back to returning the password in the response', async () => {
            const res = await request(server)
                .post(`/users/admin-reset-password/${regularUser._id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(typeof res.body.password).toBe('string');

            const login = await request(server)
                .post('/users/login')
                .send({name: 'user', password: res.body.password});
            expect(login.status).toBe(200);
        });
    });
});