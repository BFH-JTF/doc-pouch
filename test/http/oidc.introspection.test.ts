import request from 'supertest';
import {Server} from 'http';
import {URL} from 'url';
import crypto from 'crypto';
import type {SuperAgentTest} from 'supertest';
import NetworkManager from '../../src/srv/NetworkManager.js';
import NeDbWrapper from '../../src/srv/NeDbWrapper.js';
import {
    setupOidcTestServer,
    cleanupOidcState,
    createTestUsers,
    cleanupTestDatabase,
    closeOidcTestServer,
    OIDC_CLIENT_ID,
    OIDC_REDIRECT_URI,
    OIDC_REGISTRATION_TOKEN,
} from '../setup/testSetup.js';
import type {I_UserEntry} from 'docpouch-client';

// #140: token introspection (RFC 7662) with a strict allowedPolicy. Resource
// servers must be able to verify that a bearer token was issued to their own
// client_id, and /users/whoami must reveal which credential authenticated
// the request (token substitution defense).

const SCOPE = 'openid profile email offline_access';
const THIRD_PARTY_CALLBACK = 'http://localhost:3032/third-party-callback';

type LoginResult = {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
};

function generatePkce(): {codeVerifier: string, codeChallenge: string, codeChallengeMethod: 'S256'} {
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    return {codeVerifier, codeChallenge, codeChallengeMethod: 'S256'};
}

function getPathFromLocation(location: string | undefined): string {
    if (!location) {
        throw new Error('Expected a redirect Location header');
    }
    return new URL(location, OIDC_REDIRECT_URI).pathname;
}

function parseQueryParams(location: string | undefined): URLSearchParams {
    if (!location) {
        throw new Error('Expected a redirect Location header');
    }
    return new URL(location, OIDC_REDIRECT_URI).searchParams;
}

async function performLoginFlow(
    agent: SuperAgentTest,
    options: {username: string, password: string, clientId?: string, redirectUri?: string}
): Promise<LoginResult> {
    const clientId = options.clientId ?? OIDC_CLIENT_ID;
    const redirectUri = options.redirectUri ?? OIDC_REDIRECT_URI;
    const state = 'introspection-test-state';
    const nonce = 'introspection-test-nonce';
    const pkce = generatePkce();

    // prompt=consent is mandatory: oidc-provider strips offline_access from
    // the requested scope otherwise (per the OIDC spec, refresh tokens
    // require an explicit consent prompt).
    const authRes = await agent
        .get('/oidc/auth')
        .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: SCOPE,
            state,
            nonce,
            prompt: 'consent',
            code_challenge: pkce.codeChallenge,
            code_challenge_method: pkce.codeChallengeMethod,
        })
        .redirects(0);

    expect(authRes.status).toBe(303);
    const interactionLocation = authRes.headers.location;
    const interactionPath = getPathFromLocation(interactionLocation);
    expect(interactionPath).toMatch(/^\/interaction\/[^/]+/);

    const loginRes = await agent
        .post(interactionLocation as string)
        .type('form')
        .send({name: options.username, password: options.password})
        .redirects(0);

    expect(loginRes.status).toBe(303);
    const resumeLocation = loginRes.headers.location as string;
    const resumeUrl = new URL(resumeLocation, OIDC_REDIRECT_URI);
    let nextPath = resumeUrl.pathname + resumeUrl.search;

    // First-party clients finish login + consent in one round. Other
    // clients get an extra consent interaction that must be approved.
    let callbackParams: URLSearchParams | null = null;
    for (let round = 0; round < 3; round++) {
        const resumeRes = await agent.get(nextPath).redirects(0);
        expect(resumeRes.status).toBe(303);
        callbackParams = parseQueryParams(resumeRes.headers.location);
        if (callbackParams.get('code')) {
            break;
        }
        const consentPath = getPathFromLocation(resumeRes.headers.location);
        expect(consentPath).toMatch(/^\/interaction\/[^/]+/);
        const consentRes = await agent
            .post(consentPath)
            .type('form')
            .send({consent: 'yes'})
            .redirects(0);
        expect(consentRes.status).toBe(303);
        const consentResume = new URL(consentRes.headers.location as string, OIDC_REDIRECT_URI);
        nextPath = consentResume.pathname + consentResume.search;
    }

    const code = callbackParams?.get('code');
    expect(code).toBeTruthy();

    const tokenRes = await agent
        .post('/oidc/token')
        .type('form')
        .send({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: pkce.codeVerifier,
        });

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body).toHaveProperty('access_token');

    return {
        accessToken: tokenRes.body.access_token,
        idToken: tokenRes.body.id_token,
        refreshToken: tokenRes.body.refresh_token,
    };
}

async function registerThirdPartyClient(server: Server): Promise<{clientId: string}> {
    const res = await request(server)
        .post('/oidc/reg')
        .set('Authorization', `Bearer ${OIDC_REGISTRATION_TOKEN}`)
        .send({
            client_name: 'Introspection Test Resource Server',
            redirect_uris: [THIRD_PARTY_CALLBACK],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            application_type: 'web',
        });
    expect(res.status).toBe(201);
    expect(res.body.client_id).toBeTruthy();
    return {clientId: res.body.client_id};
}

function introspect(server: Server, token: string, clientId?: string) {
    const req = request(server).post('/oidc/introspection').type('form');
    if (clientId !== undefined) {
        req.send({token, client_id: clientId, token_type_hint: 'access_token'});
    } else {
        req.send({token, token_type_hint: 'access_token'});
    }
    return req;
}

describe('OIDC token introspection (#140)', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;
    let restoreEnv: () => void;
    let regularUser: I_UserEntry;

    beforeAll(async () => {
        const setup = await setupOidcTestServer();
        server = setup.server;
        dataManager = setup.dataManager;
        networkManager = setup.networkManager;
        restoreEnv = setup.restoreEnv;
    });

    afterAll(async () => {
        await closeOidcTestServer(networkManager);
        restoreEnv();
    });

    beforeEach(async () => {
        await cleanupOidcState();
        await cleanupTestDatabase(dataManager);
        const users = await createTestUsers(dataManager);
        regularUser = users.regularUser;
    });

    test('the discovery document advertises the introspection endpoint', async () => {
        const res = await request(server).get('/oidc/.well-known/openid-configuration');
        expect(res.status).toBe(200);
        // The provider renders the endpoint as an absolute URL based on the
        // request host; only the route must match.
        expect(String(res.body.introspection_endpoint)).toContain('/oidc/introspection');
    });

    test('a client can introspect a token that was issued to itself', async () => {
        const agent = request.agent(server);
        const {accessToken} = await performLoginFlow(agent, {
            username: 'user',
            password: 'userpassword',
        });

        const res = await introspect(server, accessToken, OIDC_CLIENT_ID);
        expect(res.status).toBe(200);
        expect(res.body.active).toBe(true);
        expect(res.body.client_id).toBe(OIDC_CLIENT_ID);
        expect(res.body.scope).toContain('openid');
    });

    test('introspection returns active:false for an unknown token', async () => {
        const res = await introspect(server, 'not-a-real-token', OIDC_CLIENT_ID);
        expect(res.status).toBe(200);
        expect(res.body.active).toBe(false);
    });

    test('introspection without client authentication is rejected', async () => {
        const agent = request.agent(server);
        const {accessToken} = await performLoginFlow(agent, {
            username: 'user',
            password: 'userpassword',
        });

        const res = await introspect(server, accessToken);
        expect(res.status).toBe(400);
    });

    describe('strict client binding', () => {
        test('a token issued to one client answers active:false when inspected by another client', async () => {
            const {clientId: thirdPartyId} = await registerThirdPartyClient(server);
            const agent = request.agent(server);
            const {accessToken: adminUiToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
            });

            const res = await introspect(server, adminUiToken, thirdPartyId);
            expect(res.status).toBe(200);
            expect(res.body.active).toBe(false);
        });

        test('a third-party token answers active:false when inspected by the admin UI client', async () => {
            const {clientId: thirdPartyId} = await registerThirdPartyClient(server);
            const agent = request.agent(server);
            const {accessToken: thirdPartyToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
                clientId: thirdPartyId,
                redirectUri: THIRD_PARTY_CALLBACK,
            });

            const res = await introspect(server, thirdPartyToken, OIDC_CLIENT_ID);
            expect(res.status).toBe(200);
            expect(res.body.active).toBe(false);
        });

        test('a third-party client can introspect its own token', async () => {
            const {clientId: thirdPartyId} = await registerThirdPartyClient(server);
            const agent = request.agent(server);
            const {accessToken: thirdPartyToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
                clientId: thirdPartyId,
                redirectUri: THIRD_PARTY_CALLBACK,
            });

            const res = await introspect(server, thirdPartyToken, thirdPartyId);
            expect(res.status).toBe(200);
            expect(res.body.active).toBe(true);
            expect(res.body.client_id).toBe(thirdPartyId);
            expect(res.body.sub).toBeTruthy();
        });
    });

    describe('/users/whoami credential metadata (#140)', () => {
        test('an OIDC access token reports its type and issuing client', async () => {
            const {clientId: thirdPartyId} = await registerThirdPartyClient(server);
            const agent = request.agent(server);
            const {accessToken: thirdPartyToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
                clientId: thirdPartyId,
                redirectUri: THIRD_PARTY_CALLBACK,
            });

            const res = await request(server)
                .get('/users/whoami')
                .set('Authorization', `Bearer ${thirdPartyToken}`);
            expect(res.status).toBe(200);
            expect(res.body.auth).toEqual({
                type: 'oidc',
                clientId: thirdPartyId,
                scope: SCOPE,
            });
            expect(res.body._id).toBe(regularUser._id);
        });

        test('an admin UI token reports the admin UI client', async () => {
            const agent = request.agent(server);
            const {accessToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
            });

            const res = await request(server)
                .get('/users/whoami')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(res.status).toBe(200);
            expect(res.body.auth.type).toBe('oidc');
            expect(res.body.auth.clientId).toBe(OIDC_CLIENT_ID);
        });
    });
});
