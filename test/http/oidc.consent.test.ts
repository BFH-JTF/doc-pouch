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
    OIDC_REGISTRATION_TOKEN,
} from '../setup/testSetup.js';

// Regression tests for #107: only clients listed in
// OIDC_AUTO_CONSENT_CLIENTS (by default docpouch-admin-ui) get their
// consent granted silently. Every other client must pass through the
// consent screen served by GET /interaction/:uid, and only an explicit
// decision from that screen grants the requested scopes.

const CLIENT_REDIRECT_URI = 'http://localhost:3032/third-party-callback';
const SCOPE = 'openid profile email offline_access';

type PkcePair = {
    codeVerifier: string;
    codeChallenge: string;
};

function generatePkce(): PkcePair {
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    return {codeVerifier, codeChallenge};
}

async function registerThirdPartyClient(server: Server): Promise<string> {
    const res = await request(server)
        .post('/oidc/reg')
        .set('Authorization', `Bearer ${OIDC_REGISTRATION_TOKEN}`)
        .send({
            client_name: 'Third Party Consent Test App',
            redirect_uris: [CLIENT_REDIRECT_URI],
            post_logout_redirect_uris: [CLIENT_REDIRECT_URI],
            grant_types: ['authorization_code'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            application_type: 'web',
        });

    expect(res.status).toBe(201);
    return res.body.client_id as string;
}

async function startAuthorization(agent: SuperAgentTest, clientId: string, redirectUri: string): Promise<string> {
    const pkce = generatePkce();
    const res = await agent
        .get('/oidc/auth')
        .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: SCOPE,
            state: 'consent-test-state',
            nonce: 'consent-test-nonce',
            code_challenge: pkce.codeChallenge,
            code_challenge_method: 'S256',
        })
        .redirects(0);

    expect(res.status).toBe(303);
    const location = res.headers.location as string;
    expect(location).toMatch(/^\/interaction\//);
    return location;
}

async function submitLogin(agent: SuperAgentTest, interactionPath: string): Promise<string> {
    const res = await agent
        .post(interactionPath)
        .type('form')
        .send({name: 'user', password: 'userpassword'})
        .redirects(0);

    expect(res.status).toBe(303);
    return res.headers.location as string;
}

// Follows one redirect from the given location and returns the Location
// header of the response (i.e. hops one step further in the chain).
async function followRedirectOnce(agent: SuperAgentTest, location: string): Promise<{
    status: number;
    location: string | undefined;
    body: string;
}> {
    const url = new URL(location, 'http://localhost:3032');
    const pathWithQuery = url.pathname + (url.search || '');
    const res = await agent.get(pathWithQuery).redirects(0);
    return {status: res.status, location: res.headers.location, body: res.text};
}

describe('OIDC consent screen for non-first-party clients', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;
    let restoreEnv: () => void;
    let thirdPartyClientId: string;

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
        await createTestUsers(dataManager);
        // The OIDC state cleanup above also wipes registered clients, so the
        // third-party client must be (re-)registered for every test.
        thirdPartyClientId = await registerThirdPartyClient(server);
    });

    test('the first-party admin UI client is still granted consent silently', async () => {
        const agent = request.agent(server);

        const loginPath = await startAuthorization(agent, 'docpouch-admin-ui', 'http://localhost:3032/');
        expect(loginPath).toMatch(/^\/interaction\//);

        // Login round for the allowlisted client finishes the whole flow
        // (login + consent) in one submission.
        const res = await agent
            .post(loginPath)
            .type('form')
            .send({name: 'user', password: 'userpassword'})
            .redirects(0);

        expect(res.status).toBe(303);
        const resumeLocation = res.headers.location as string;
        const resume = await followRedirectOnce(agent, resumeLocation);
        expect(resume.status).toBe(303);
        const callbackParams = new URL(resume.location as string, 'http://localhost:3032/').searchParams;
        expect(callbackParams.get('code')).toBeTruthy();
    });

    test('a third-party client is shown a consent screen after login, and Allow grants the flow', async () => {
        const agent = request.agent(server);

        // 1. Start the authorization request for the third-party client.
        const loginPath = await startAuthorization(agent, thirdPartyClientId, CLIENT_REDIRECT_URI);

        // 2. Submit the login form. For non-first-party clients the login
        //    round finishes on its own — consent must NOT be granted yet.
        const afterLogin = await submitLogin(agent, loginPath);
        expect(afterLogin).toBeDefined();

        // 3. The provider re-evaluates and prompts for consent.
        const resumeStep = await followRedirectOnce(agent, afterLogin);
        expect(resumeStep.status).toBe(303);
        const consentPath = resumeStep.location as string;
        expect(consentPath).toMatch(/^\/interaction\//);

        // 4. GET renders the consent screen (not an auto-redirect).
        const consentPage = await agent.get(consentPath).redirects(0);
        expect(consentPage.status).toBe(200);
        expect(consentPage.type).toBe('text/html');
        expect(consentPage.text).toContain('Third Party Consent Test App');
        expect(consentPage.text).toContain('Authorize application');
        expect(consentPage.text).toContain('Allow');
        expect(consentPage.text).toContain('Deny');
        // Scope descriptions must be listed.
        expect(consentPage.text).toContain('Verify your identity');
        expect(consentPage.text).toContain('Read your email address');

        // 5. The user approves on the consent screen.
        const consentSubmit = await agent
            .post(consentPath)
            .type('form')
            .send({consent: 'yes'})
            .redirects(0);
        expect(consentSubmit.status).toBe(303);

        // 6. Follow the resume redirect to obtain the authorization code.
        const codeStep = await followRedirectOnce(agent, consentSubmit.headers.location as string);
        expect(codeStep.status).toBe(303);
        const callbackUrl = new URL(codeStep.location as string, 'http://localhost:3032/');
        expect(callbackUrl.origin + callbackUrl.pathname).toBe(CLIENT_REDIRECT_URI);
        const code = callbackUrl.searchParams.get('code');
        expect(code).toBeTruthy();
        expect(callbackUrl.searchParams.get('state')).toBe('consent-test-state');
    });

    test('Deny on the consent screen aborts the authorization with access_denied', async () => {
        const agent = request.agent(server);

        const loginPath = await startAuthorization(agent, thirdPartyClientId, CLIENT_REDIRECT_URI);
        const afterLogin = await submitLogin(agent, loginPath);
        const resumeStep = await followRedirectOnce(agent, afterLogin);
        const consentPath = resumeStep.location as string;

        const consentPage = await agent.get(consentPath).redirects(0);
        expect(consentPage.status).toBe(200);

        const denySubmit = await agent
            .post(consentPath)
            .type('form')
            .send({consent: 'no'})
            .redirects(0);
        expect(denySubmit.status).toBe(303);

        const codeStep = await followRedirectOnce(agent, denySubmit.headers.location as string);
        expect(codeStep.status).toBe(303);
        const callbackUrl = new URL(codeStep.location as string, 'http://localhost:3032/');
        expect(callbackUrl.origin + callbackUrl.pathname).toBe(CLIENT_REDIRECT_URI);
        expect(callbackUrl.searchParams.get('error')).toBe('access_denied');
        expect(callbackUrl.searchParams.get('code')).toBeNull();
    });

    test('a submission without a decision does not grant consent', async () => {
        const agent = request.agent(server);

        const loginPath = await startAuthorization(agent, thirdPartyClientId, CLIENT_REDIRECT_URI);
        const afterLogin = await submitLogin(agent, loginPath);
        const resumeStep = await followRedirectOnce(agent, afterLogin);
        const consentPath = resumeStep.location as string;

        // No consent decision in the body (e.g. an empty form post): the
        // consent screen must be re-rendered, never granted.
        const res = await agent
            .post(consentPath)
            .type('form')
            .send({})
            .redirects(0);

        expect(res.status).toBe(302);
        const redirectedPath = new URL(res.headers.location as string, 'http://localhost:3032/').pathname;
        expect(redirectedPath).toBe(new URL(consentPath, 'http://localhost:3032/').pathname);
    });
});