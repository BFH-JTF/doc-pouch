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

// Submits a consent decision ("yes"/"no") to the consent screen and follows
// the resulting resume redirect, returning the Location header of the
// resumed authorization: either the RP callback (absolute URL with code or
// error) or — regression, #135 — another /interaction/ redirect.
async function decideConsent(agent: SuperAgentTest, consentPath: string, decision: 'yes' | 'no'): Promise<{
    status: number;
    location: string | undefined;
    callbackUrl: URL | null;
}> {
    const submit = await agent
        .post(consentPath)
        .type('form')
        .send({consent: decision})
        .redirects(0);
    if (submit.status !== 303 || !submit.headers.location) {
        return {status: submit.status, location: submit.headers.location, callbackUrl: null};
    }
    const resumePath = new URL(submit.headers.location, 'http://localhost:3032').pathname;
    const resume = await agent.get(resumePath).redirects(0);
    const loc = resume.headers.location as string | undefined;
    return {
        status: resume.status,
        location: loc,
        callbackUrl: loc && !loc.includes('/interaction/') ? new URL(loc, 'http://localhost:3032/') : null,
    };
}

// Starts an authorization request with an explicit scope and returns the
// redirect target (the first /interaction/:uid screen).
async function startAuthorizationWithScope(agent: SuperAgentTest, clientId: string, redirectUri: string, scope: string): Promise<string> {
    const pkce = generatePkce();
    const res = await agent
        .get('/oidc/auth')
        .query({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: redirectUri,
            scope,
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

// Completes the interaction round for the given redirect target: login round
// first when the prompt asks for it, then the consent decision. Returns the
// Location of the resumed authorization (RP callback or, on the #135
// regression, another /interaction/ redirect).
async function consentRound(agent: SuperAgentTest, interactionPath: string, decision: 'yes' | 'no' = 'yes'): Promise<{
    status: number;
    location: string | undefined;
    callbackUrl: URL | null;
}> {
    const details = await agent.get(`${interactionPath}/details`);
    if (details.body.prompt === 'login') {
        const loginPost = await agent
            .post(interactionPath)
            .type('form')
            .send({name: 'user', password: 'userpassword'})
            .redirects(0);
        expect(loginPost.status).toBe(303);
        const resumeStep = await followRedirectOnce(agent, loginPost.headers.location as string);
        // The re-evaluated authorization either asks for consent or is done.
        if (!resumeStep.location || !resumeStep.location.includes('/interaction/')) {
            const loc = resumeStep.location as string;
            return {status: resumeStep.status, location: loc, callbackUrl: new URL(loc, 'http://localhost:3032/')};
        }
        return await decideConsent(agent, resumeStep.location as string, decision);
    }
    return await decideConsent(agent, interactionPath, decision);
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

    test('a non-uid-shaped interaction parameter is rejected before any rendering', async () => {
        const evilUid = encodeURIComponent('abc"><script>alert(1)</script>');

        const getRes = await request(server).get(`/interaction/${evilUid}`).redirects(0);
        expect(getRes.status).toBe(400);
        expect(getRes.text).not.toContain('<script>');

        const postRes = await request(server)
            .post(`/interaction/${evilUid}`)
            .type('form')
            .send({name: 'user', password: 'userpassword'});
        expect(postRes.status).toBe(400);
        expect(postRes.text).not.toContain('<script>');
    });
});

// #135 regression: the consent decision must extend the grant the
// interaction already carries (remembered from the first authorization).
// Creating a fresh grant containing only the missing scopes of the current
// prompt silently drops previously granted scopes, and the resumed
// authorization re-prompts consent forever because the reduced grant never
// satisfies the policy.
describe('OIDC consent grant reuse for non-first-party clients (#135)', () => {
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

    test('a scope upgrade completes with Allow and keeps previously granted scopes', async () => {
        // ALL rounds share ONE browser session: the remembered grant is bound
        // to the session, so the bug reproduces exactly like a real browser
        // upgrading the scopes of an already-consented client.
        const agent = request.agent(server);

        // Round 1: grant `openid profile` for the client.
        const firstLoginPath = await startAuthorizationWithScope(
            agent, thirdPartyClientId, CLIENT_REDIRECT_URI, 'openid profile');
        const firstConsent = await consentRound(agent, firstLoginPath);
        expect(firstConsent.callbackUrl).not.toBeNull();
        expect(firstConsent.callbackUrl!.searchParams.get('code')).toBeTruthy();

        // Round 2 (same session): request MORE scopes for the same client.
        // On the bug this loops forever: each Allow creates a grant with only
        // the missing delta of the current prompt, the resumed authorization
        // finds the previously granted scopes missing again, and re-prompts.
        const secondLoginPath = await startAuthorizationWithScope(
            agent, thirdPartyClientId, CLIENT_REDIRECT_URI, 'openid profile email offline_access');
        const secondConsent = await consentRound(agent, secondLoginPath);
        expect(secondConsent.callbackUrl).not.toBeNull();
        expect(secondConsent.callbackUrl!.origin + secondConsent.callbackUrl!.pathname).toBe(CLIENT_REDIRECT_URI);
        expect(secondConsent.callbackUrl!.searchParams.get('code')).toBeTruthy();
        expect(secondConsent.callbackUrl!.searchParams.get('error')).toBeNull();

        // Round 3 (same session): the union of round 1 + round 2 scopes must
        // be remembered, so NO third consent screen may appear and the
        // authorization completes directly.
        const thirdPkce = generatePkce();
        const thirdRes = await agent
            .get('/oidc/auth')
            .query({
                response_type: 'code',
                client_id: thirdPartyClientId,
                redirect_uri: CLIENT_REDIRECT_URI,
                scope: 'openid profile email offline_access',
                state: 'third-round-state',
                nonce: 'third-round-nonce',
                code_challenge: thirdPkce.codeChallenge,
                code_challenge_method: 'S256',
            })
            .redirects(0);
        expect(thirdRes.status).toBe(303);
        const callback = new URL(thirdRes.headers.location as string);
        expect(callback.origin + callback.pathname).toBe(CLIENT_REDIRECT_URI);
        expect(callback.searchParams.get('code')).toBeTruthy();
    });

    test('a re-authorization within the same session is granted without any interaction', async () => {
        // Round 1: full login -> consent -> code.
        const firstAgent = request.agent(server);
        const loginPath = await startAuthorizationWithScope(
            firstAgent, thirdPartyClientId, CLIENT_REDIRECT_URI, SCOPE);
        const first = await consentRound(firstAgent, loginPath);
        expect(first.callbackUrl).not.toBeNull();

        // Round 2: same agent (session still alive), identical scopes. The
        // remembered grant must cover the request; no interaction round may
        // be created at all.
        const replayPkce = generatePkce();
        const res = await firstAgent
            .get('/oidc/auth')
            .query({
                response_type: 'code',
                client_id: thirdPartyClientId,
                redirect_uri: CLIENT_REDIRECT_URI,
                scope: SCOPE,
                state: 'replay-state',
                nonce: 'replay-nonce',
                code_challenge: replayPkce.codeChallenge,
                code_challenge_method: 'S256',
            })
            .redirects(0);
        expect(res.status).toBe(303);
        const callback = new URL(res.headers.location as string);
        expect(callback.origin + callback.pathname).toBe(CLIENT_REDIRECT_URI);
        expect(callback.searchParams.get('code')).toBeTruthy();
        expect(callback.searchParams.get('error')).toBeNull();
    });

    test('Deny is still honored on a scope-upgrade authorization', async () => {
        // Round 1 grants openid profile (same session kept below).
        const agent = request.agent(server);
        const firstLoginPath = await startAuthorizationWithScope(
            agent, thirdPartyClientId, CLIENT_REDIRECT_URI, 'openid profile');
        await consentRound(agent, firstLoginPath);

        // Round 2: upgraded scope; the user denies.
        const secondLoginPath = await startAuthorizationWithScope(
            agent, thirdPartyClientId, CLIENT_REDIRECT_URI, 'openid profile email');
        const denied = await consentRound(agent, secondLoginPath, 'no');
        expect(denied.callbackUrl).not.toBeNull();
        expect(denied.callbackUrl!.searchParams.get('error')).toBe('access_denied');
        expect(denied.callbackUrl!.searchParams.get('code')).toBeNull();
    });
});