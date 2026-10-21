import request from 'supertest';
import express, {type Express, type Request} from 'express';
import {authRateLimiter, authKeyGenerator} from '../../src/srv/rateLimiters.js';
import {resolveTrustProxy, type TrustProxySetting} from '../../src/srv/trustProxy.js';

function buildEchoApp(trustSetting: TrustProxySetting | 'default'): Express {
    const app = express();
    app.set('trust proxy', trustSetting === 'default' ? resolveTrustProxy({}) : trustSetting);
    app.get('/echo', (req, res) => {
        res.status(200).json({ip: req.ip});
    });
    return app;
}

describe('resolveTrustProxy', () => {
    test('defaults to loopback when TRUST_PROXY is unset or blank', () => {
        expect(resolveTrustProxy({})).toBe('loopback');
        expect(resolveTrustProxy({TRUST_PROXY: ''})).toBe('loopback');
        expect(resolveTrustProxy({TRUST_PROXY: '   '})).toBe('loopback');
    });

    test('parses boolean values', () => {
        expect(resolveTrustProxy({TRUST_PROXY: 'true'})).toBe(true);
        expect(resolveTrustProxy({TRUST_PROXY: 'false'})).toBe(false);
    });

    test('parses hop counts as numbers', () => {
        expect(resolveTrustProxy({TRUST_PROXY: '1'})).toBe(1);
        expect(resolveTrustProxy({TRUST_PROXY: '2'})).toBe(2);
        expect(resolveTrustProxy({TRUST_PROXY: '0'})).toBe(0);
    });

    test('passes through proxy address group names', () => {
        expect(resolveTrustProxy({TRUST_PROXY: 'loopback'})).toBe('loopback');
        expect(resolveTrustProxy({TRUST_PROXY: 'linklocal'})).toBe('linklocal');
        expect(resolveTrustProxy({TRUST_PROXY: 'uniquelocal'})).toBe('uniquelocal');
    });

    test('accepts explicit IP addresses and CIDR subnets', () => {
        expect(resolveTrustProxy({TRUST_PROXY: '127.0.0.1'})).toBe('127.0.0.1');
        expect(resolveTrustProxy({TRUST_PROXY: ' 10.1.2.3, 192.168.0.0/16 '})).toBe('10.1.2.3,192.168.0.0/16');
        expect(resolveTrustProxy({TRUST_PROXY: 'fe80::1'})).toBe('fe80::1');
        expect(resolveTrustProxy({TRUST_PROXY: 'fe80::/10'})).toBe('fe80::/10');
        expect(resolveTrustProxy({TRUST_PROXY: 'loopback,10.1.2.3'})).toBe('loopback,10.1.2.3');
    });

    test('rejects unknown values with a descriptive error', () => {
        expect(() => resolveTrustProxy({TRUST_PROXY: 'banana'})).toThrow(/TRUST_PROXY/);
        expect(() => resolveTrustProxy({TRUST_PROXY: '300.0.0.1'})).toThrow(/TRUST_PROXY/);
        expect(() => resolveTrustProxy({TRUST_PROXY: '10.0.0.0/33'})).toThrow(/TRUST_PROXY/);
        expect(() => resolveTrustProxy({TRUST_PROXY: 'fe80::/129'})).toThrow(/TRUST_PROXY/);
    });
});

describe('trust proxy resolution behavior in express', () => {
    const chains = '198.51.100.10, 198.51.100.9';

    test('default (loopback) trusts only the loopback socket hop', async () => {
        const response = await request(buildEchoApp('default')).get('/echo').set('X-Forwarded-For', chains);
        expect(response.status).toBe(200);
        expect(response.body.ip).toBe('198.51.100.9');
    });

    test('hop count 2 trusts both forwarded hops', async () => {
        const response = await request(buildEchoApp(resolveTrustProxy({TRUST_PROXY: '2'}))).get('/echo').set('X-Forwarded-For', chains);
        expect(response.status).toBe(200);
        expect(response.body.ip).toBe('198.51.100.10');
    });

    test('false ignores forwarded headers entirely', async () => {
        const response = await request(buildEchoApp(false)).get('/echo').set('X-Forwarded-For', chains);
        expect(response.status).toBe(200);
        expect(response.body.ip).toMatch(/127\.0\.0\.1|::1/);
    });
});

describe('authRateLimiter username+IP keying', () => {
    let app: Express;
    const previousNodeEnv = process.env.NODE_ENV;

    const post = (clientIp: string, body: Record<string, unknown>) =>
        request(app).post('/login').set('X-Forwarded-For', clientIp).send(body);

    beforeAll(() => {
        process.env.NODE_ENV = 'development';
        const limiterApp = express();
        limiterApp.set('trust proxy', 'loopback');
        limiterApp.use(express.json());
        limiterApp.post('/login', authRateLimiter, (req, res) => {
            res.status(200).json({ip: req.ip});
        });
        app = limiterApp;
    });

    afterAll(() => {
        process.env.NODE_ENV = previousNodeEnv;
    });

    test('isolates users behind the same NAT address', async () => {
        const natIp = '198.51.100.10';
        for (let attempt = 0; attempt < 5; attempt++) {
            const response = await post(natIp, {name: 'alice-keying-test', password: 'secret'});
            expect(response.status).toBe(200);
        }
        const blocked = await post(natIp, {name: 'alice-keying-test', password: 'secret'});
        expect(blocked.status).toBe(429);
        expect(blocked.text).toContain('Too many authentication attempts');
        expect((await post(natIp, {name: 'bob-keying-test', password: 'secret'})).status).toBe(200);
        expect((await post('198.51.100.11', {name: 'alice-keying-test', password: 'secret'})).status).toBe(200);
        expect((await post(natIp + ', 127.0.0.1', {name: 'alice-keying-test', password: 'secret'})).status).toBe(429);
    });

    test('requests without a username share the per-IP fallback bucket', async () => {
        const clientIp = '198.51.100.20';
        for (let attempt = 0; attempt < 5; attempt++) {
            expect((await post(clientIp, {password: 'secret'})).status).toBe(200);
        }
        expect((await post(clientIp, {password: 'secret'})).status).toBe(429);
        expect((await post(clientIp, {name: 'carol-keying-test', password: 'secret'})).status).toBe(200);
    });

    test('usernames longer than the key cap are truncated into one bucket', async () => {
        const clientIp = '198.51.100.30';
        const overlong = 'y'.repeat(200);
        for (let attempt = 0; attempt < 5; attempt++) {
            expect((await post(clientIp, {name: overlong, password: 'secret'})).status).toBe(200);
        }
        expect((await post(clientIp, {name: 'y'.repeat(130), password: 'secret'})).status).toBe(429);
    });

    test('non-string usernames fall back to the IP key', () => {
        const fakeRequest = {body: {name: {evil: true}}, ip: '10.0.0.1'} as unknown as Request;
        expect(authKeyGenerator(fakeRequest)).toBe('10.0.0.1');
        expect(authKeyGenerator({body: {}, ip: '10.0.0.1'} as unknown as Request)).toBe('10.0.0.1');
        expect(authKeyGenerator({body: {name: 'alice'}, ip: '10.0.0.1'} as unknown as Request)).toBe('10.0.0.1:alice');
    });

    test('IPv6 addresses are grouped into subnets for the key', () => {
        expect(authKeyGenerator({body: {name: 'alice'}, ip: '2001:db8::1'} as unknown as Request))
            .toMatch(/^2001:db8::\/\d{1,3}:alice$/);
    });
});