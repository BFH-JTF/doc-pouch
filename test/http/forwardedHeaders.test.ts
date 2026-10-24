import request from 'supertest';
import express, {type Express, type Request, type Response, type NextFunction, type RequestHandler} from 'express';
import {stripUntrustedForwardedHeaders} from '../../src/srv/trustProxy.js';

function buildEchoApp(trustSetting: boolean | number | string, withStripper: boolean = true): Express {
    const app = express();
    app.set('trust proxy', trustSetting);
    if (withStripper) {
        app.use(stripUntrustedForwardedHeaders(trustSetting));
    }
    app.get('/echo', (req: Request, res: Response) => {
        res.status(200).json({
            ip: req.ip,
            forwardedFor: req.headers['x-forwarded-for'] ?? null,
            forwardedHost: req.headers['x-forwarded-host'] ?? null,
        });
    });
    return app;
}

function runMiddleware(middleware: RequestHandler, headers: Record<string, string>, remoteAddress: string): {
    headers: Request['headers'],
    nextCalled: boolean,
} {
    const req = {headers: {...headers}, socket: {remoteAddress}} as unknown as Request;
    let nextCalled = false;
    const next: NextFunction = () => {
        nextCalled = true;
    };
    middleware(req, {} as Response, next);
    return {headers: req.headers, nextCalled};
}

describe('stripUntrustedForwardedHeaders middleware behavior', () => {
    test('removes every forwarded variant from an untrusted peer', () => {
        const middleware = stripUntrustedForwardedHeaders('uniquelocal');
        const result = runMiddleware(middleware, {
            'x-forwarded-for': '1.2.3.4',
            'x-forwarded-host': 'evil.example',
            'x-forwarded-proto': 'https',
            'x-forwarded-port': '443',
            'forwarded': 'for=1.2.3.4',
            'host': 'real.host',
        }, '203.0.113.9');
        expect(result.nextCalled).toBe(true);
        expect(result.headers).toEqual({host: 'real.host'});
    });

    test('keeps forwarded headers from a trusted proxy hop', () => {
        const middleware = stripUntrustedForwardedHeaders('uniquelocal');
        const result = runMiddleware(middleware, {'x-forwarded-for': '1.2.3.4'}, '192.168.1.5');
        expect(result.nextCalled).toBe(true);
        expect(result.headers['x-forwarded-for']).toBe('1.2.3.4');
    });

    test('explicit IPv6 subnet: trusted hop is kept, others are stripped', () => {
        const middleware = stripUntrustedForwardedHeaders('2001:db8::/32');
        const kept = runMiddleware(middleware, {'x-forwarded-for': '198.51.100.10'}, '2001:db8::1');
        expect(kept.headers['x-forwarded-for']).toBe('198.51.100.10');
        const stripped = runMiddleware(middleware, {'x-forwarded-for': '198.51.100.10'}, '2001:db9::1');
        expect(stripped.headers['x-forwarded-for']).toBeUndefined();
    });

    test('IPv4-mapped loopback peer is normalized and trusted with the loopback default', () => {
        const middleware = stripUntrustedForwardedHeaders('loopback');
        const result = runMiddleware(middleware, {'x-forwarded-for': '198.51.100.10'}, '::ffff:127.0.0.1');
        expect(result.headers['x-forwarded-for']).toBe('198.51.100.10');
    });

    test('peer without an address is treated as untrusted', () => {
        const middleware = stripUntrustedForwardedHeaders('loopback');
        const req = {headers: {'x-forwarded-for': '198.51.100.10'}, socket: {}} as unknown as Request;
        let nextCalled = false;
        middleware(req, {} as Response, () => {
            nextCalled = true;
        });
        expect(nextCalled).toBe(true);
        expect(req.headers['x-forwarded-for']).toBeUndefined();
    });
});

describe('stripUntrustedForwardedHeaders in the express request pipeline', () => {
    test('untrusted peer: req.ip falls back to the direct peer address', async () => {
        const response = await request(buildEchoApp('203.0.113.50')).get('/echo').set('X-Forwarded-For', '198.51.100.10, 198.51.100.9');
        expect(response.status).toBe(200);
        expect(response.body.ip).toMatch(/127\.0\.0\.1|::1/);
        expect(response.body.forwardedFor).toBeNull();
    });

    test('control: without the middleware the spoofed header still reaches handlers, req.ip is already safe', async () => {
        const response = await request(buildEchoApp('203.0.113.50', false)).get('/echo').set('X-Forwarded-For', '198.51.100.10, 198.51.100.9');
        expect(response.status).toBe(200);
        expect(response.body.ip).toBe('127.0.0.1');
        expect(response.body.forwardedFor).toBe('198.51.100.10, 198.51.100.9');
    });

    test('trusted loopback proxy: forwarded headers survive', async () => {
        const response = await request(buildEchoApp('loopback')).get('/echo').set('X-Forwarded-For', '198.51.100.10, 198.51.100.9');
        expect(response.status).toBe(200);
        expect(response.body.ip).toBe('198.51.100.9');
        expect(response.body.forwardedFor).toBe('198.51.100.10, 198.51.100.9');
    });

    test('TRUST_PROXY=false strips forwarded headers even from loopback peers', async () => {
        const response = await request(buildEchoApp(false)).get('/echo').set('X-Forwarded-For', '198.51.100.10');
        expect(response.status).toBe(200);
        expect(response.body.ip).toMatch(/127\.0\.0\.1|::1/);
        expect(response.body.forwardedFor).toBeNull();
    });

    test('hop count trust: direct loopback peer is trusted, hop 0 is not', async () => {
        const keep = await request(buildEchoApp(1)).get('/echo').set('X-Forwarded-For', '198.51.100.10, 198.51.100.9');
        expect(keep.body.ip).toBe('198.51.100.9');
        expect(keep.body.forwardedFor).toBe('198.51.100.10, 198.51.100.9');
        const strip = await request(buildEchoApp(0)).get('/echo').set('X-Forwarded-For', '198.51.100.10');
        expect(strip.body.ip).toMatch(/127\.0\.0\.1|::1/);
        expect(strip.body.forwardedFor).toBeNull();
    });
});