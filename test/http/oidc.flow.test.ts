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
    OIDC_POST_LOGOUT_URI,
} from '../setup/testSetup.js';

type LoginResult = {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
};

type LogoutPromptInfo = {
    interactionUrl: string;
    actionUrl: string;
    xsrf: string;
    cancelUrl: string;
    rawForm: string;
};

type PkcePair = {
    codeVerifier: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
};

const SCOPE = 'openid profile email offline_access';

function generatePkce(): PkcePair {
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    return {codeVerifier, codeChallenge, codeChallengeMethod: 'S256'};
}

function extractXsrf(form: string): string {
    const match = form.match(/name="xsrf"\s+type="hidden"\s+value="([^"]*)"/);
    if (!match) {
        throw new Error('Could not find xsrf token in logout form');
    }
    return match[1];
}

function extractActionUrl(form: string): string {
    const match = form.match(/action="([^"]+)"/);
    if (!match) {
        throw new Error('Could not find form action in logout form');
    }
    return match[1];
}

function parseQueryParams(location: string | undefined): URLSearchParams {
    if (!location) {
        throw new Error('Expected a redirect Location header');
    }
    return new URL(location, OIDC_REDIRECT_URI).searchParams;
}

function getPathFromLocation(location: string | undefined): string {
    if (!location) {
        throw new Error('Expected a redirect Location header');
    }
    return new URL(location, OIDC_REDIRECT_URI).pathname;
}

function isLoginInteractionRedirect(location: string | undefined): boolean {
    if (!location) {
        return false;
    }
    const path = getPathFromLocation(location);
    return /^\/interaction\/[^/]+/.test(path);
}

async function performLoginFlow(
    agent: SuperAgentTest,
    options: { username: string; password: string }
): Promise<LoginResult> {
    const state = 'test-state';
    const nonce = 'test-nonce';
    const pkce = generatePkce();

    const authRes = await agent
        .get('/oidc/auth')
        .query({
            response_type: 'code',
            client_id: OIDC_CLIENT_ID,
            redirect_uri: OIDC_REDIRECT_URI,
            scope: SCOPE,
            state,
            nonce,
            code_challenge: pkce.codeChallenge,
            code_challenge_method: pkce.codeChallengeMethod,
        })
        .redirects(0);

    expect(authRes.status).toBe(303);
    const interactionLocation = authRes.headers.location;
    expect(interactionLocation).toBeDefined();
    const interactionPath = getPathFromLocation(interactionLocation);
    expect(interactionPath).toMatch(/^\/interaction\/[^/]+/);

    const loginRes = await agent
        .post(interactionLocation as string)
        .type('form')
        .send({name: options.username, password: options.password})
        .redirects(0);

    expect(loginRes.status).toBe(303);
    const resumeLocation = loginRes.headers.location as string;
    expect(resumeLocation).toBeDefined();
    const resumePath = new URL(resumeLocation, OIDC_REDIRECT_URI).pathname + new URL(resumeLocation, OIDC_REDIRECT_URI).search;

    const resumeRes = await agent.get(resumePath).redirects(0);

    expect(resumeRes.status).toBe(303);
    const callbackParams = parseQueryParams(resumeRes.headers.location);
    const code = callbackParams.get('code');
    const returnedState = callbackParams.get('state');
    expect(code).toBeTruthy();
    expect(returnedState).toBe(state);

    const tokenRes = await agent
        .post('/oidc/token')
        .type('form')
        .send({
            grant_type: 'authorization_code',
            code,
            client_id: OIDC_CLIENT_ID,
            redirect_uri: OIDC_REDIRECT_URI,
            code_verifier: pkce.codeVerifier,
        });

    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body).toHaveProperty('access_token');
    expect(tokenRes.body).toHaveProperty('id_token');
    expect(tokenRes.body).toHaveProperty('token_type', 'Bearer');

    return {
        accessToken: tokenRes.body.access_token,
        idToken: tokenRes.body.id_token,
        refreshToken: tokenRes.body.refresh_token,
    };
}

async function startLogoutPrompt(
    agent: SuperAgentTest,
    idToken: string
): Promise<LogoutPromptInfo> {
    const endSessionRes = await agent
        .get('/oidc/end_session')
        .query({
            id_token_hint: idToken,
            post_logout_redirect_uri: OIDC_POST_LOGOUT_URI,
        })
        .redirects(0);

    expect(endSessionRes.status).toBe(200);
    expect(endSessionRes.text).toContain('Sign Out');

    const actionUrl = extractActionUrl(endSessionRes.text);
    process.stderr.write(`START LOGOUT: actionUrl=${actionUrl}\n`);
    return {
        interactionUrl: endSessionRes.request.url,
        actionUrl,
        xsrf: extractXsrf(endSessionRes.text),
        rawForm: endSessionRes.text,
    };
}

async function probeAuthorization(agent: SuperAgentTest): Promise<{ status: number; location: string | undefined }> {
    const pkce = generatePkce();
    const res = await agent
        .get('/oidc/auth')
        .query({
            response_type: 'code',
            client_id: OIDC_CLIENT_ID,
            redirect_uri: OIDC_REDIRECT_URI,
            scope: SCOPE,
            state: 'probe-state',
            nonce: 'probe-nonce',
            code_challenge: pkce.codeChallenge,
            code_challenge_method: pkce.codeChallengeMethod,
        })
        .redirects(0);

    return {status: res.status, location: res.headers.location};
}

describe('OIDC Interactive Flow', () => {
    let server: Server;
    let dataManager: NeDbWrapper;
    let networkManager: NetworkManager;
    let restoreEnv: () => void;

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
    });

    describe('Authorization code login', () => {
        test('a valid user can complete the full login flow and call userinfo', async () => {
            const agent = request.agent(server);

            const {accessToken, idToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
            });

            expect(typeof accessToken).toBe('string');
            expect(accessToken.length).toBeGreaterThan(0);
            expect(typeof idToken).toBe('string');
            expect(idToken.length).toBeGreaterThan(0);

            const userinfoRes = await agent
                .get('/oidc/userinfo')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(userinfoRes.status).toBe(200);
            expect(userinfoRes.body).toHaveProperty('sub');
        });

        test('invalid credentials redirect back to the login page with an error', async () => {
            const agent = request.agent(server);

            const pkce = generatePkce();
            const authRes = await agent
                .get('/oidc/auth')
                .query({
                    response_type: 'code',
                    client_id: OIDC_CLIENT_ID,
                    redirect_uri: OIDC_REDIRECT_URI,
                    scope: SCOPE,
                    state: 'bad-state',
                    nonce: 'bad-nonce',
                    code_challenge: pkce.codeChallenge,
                    code_challenge_method: pkce.codeChallengeMethod,
                })
                .redirects(0);

            expect(authRes.status).toBe(303);
            const interactionLocation = authRes.headers.location as string;

            const badLoginRes = await agent
                .post(interactionLocation)
                .type('form')
                .send({name: 'user', password: 'wrong-password'})
                .redirects(0);

            expect(badLoginRes.status).toBe(302);
            const errorLocation = badLoginRes.headers.location as string;
            const errorUrl = new URL(errorLocation, OIDC_REDIRECT_URI);
            expect(errorUrl.pathname).toBe(new URL(interactionLocation, OIDC_REDIRECT_URI).pathname);
            expect(errorUrl.searchParams.get('error')).toBe('Invalid username or password');
        });
    });

    describe('RP-initiated logout (confirmed)', () => {
        test('confirming the logout prompt destroys the session and redirects to post_logout_redirect_uri', async () => {
            const agent = request.agent(server);

            const {idToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
            });

            const prompt = await startLogoutPrompt(agent, idToken);

            const confirmPath = getPathFromLocation(prompt.actionUrl);
            const confirmRes = await agent
                .post(confirmPath)
                .type('form')
                .send({logout: 'yes', xsrf: prompt.xsrf})
                .redirects(0);

            expect(confirmRes.status).toBe(303);
            const confirmUrl = new URL(confirmRes.headers.location as string, OIDC_REDIRECT_URI);
            expect(confirmUrl.pathname).toBe(new URL(OIDC_POST_LOGOUT_URI).pathname);

            const probe = await probeAuthorization(agent);
            expect(probe.status).toBe(303);
            expect(isLoginInteractionRedirect(probe.location)).toBe(true);
        });
    });

    describe('RP-initiated logout (cancelled)', () => {
        test('cancelling the logout prompt redirects to post_logout_redirect_uri with logout=no', async () => {
            const agent = request.agent(server);

            const {idToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
            });

            const prompt = await startLogoutPrompt(agent, idToken);

            // The cancel button in the logout confirmation page uses
            // formaction="/oidc/cancel-logout" so that the request bypasses
            // the OIDC provider's /end_session/confirm handler (which would
            // reset the session identifier on cancel and effectively log
            // the user out). Instead, the request is handled by our custom
            // /oidc/cancel-logout handler which redirects to the
            // post_logout_redirect_uri with ?logout=no appended.
            //
            // The ?logout=no query string is critical: the client library's
            // wasJustLoggedOut() helper checks for it to distinguish a
            // cancel from a successful logout. Without it, the client
            // would assume the logout succeeded and wipe the OIDC session
            // from localStorage, even though the server preserved it.
            const cancelRes = await agent
                .post('/oidc/cancel-logout')
                .type('form')
                .send({
                    logout: 'no',
                    xsrf: prompt.xsrf,
                    post_logout_redirect_uri: OIDC_POST_LOGOUT_URI,
                })
                .redirects(0);

            expect(cancelRes.status).toBe(303);
            const cancelUrl = new URL(cancelRes.headers.location as string, OIDC_REDIRECT_URI);
            expect(cancelUrl.pathname).toBe(new URL(OIDC_POST_LOGOUT_URI).pathname);
            expect(cancelUrl.searchParams.get('logout')).toBe('no');
        });

        test('cancelling appends logout=no with & when post_logout_redirect_uri already has a query string', async () => {
            const agent = request.agent(server);

            const {idToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
            });

            const prompt = await startLogoutPrompt(agent, idToken);

            const uriWithQuery = `${OIDC_POST_LOGOUT_URI}?foo=bar`;
            const cancelRes = await agent
                .post('/oidc/cancel-logout')
                .type('form')
                .send({
                    logout: 'no',
                    xsrf: prompt.xsrf,
                    post_logout_redirect_uri: uriWithQuery,
                })
                .redirects(0);

            expect(cancelRes.status).toBe(303);
            const cancelUrl = new URL(cancelRes.headers.location as string, OIDC_REDIRECT_URI);
            expect(cancelUrl.searchParams.get('foo')).toBe('bar');
            expect(cancelUrl.searchParams.get('logout')).toBe('no');
        });

        test('the cancel button is a form submit that posts to /oidc/cancel-logout', async () => {
            const agent = request.agent(server);

            const {idToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
            });

            const prompt = await startLogoutPrompt(agent, idToken);

            // The cancel button should be a submit button with
            // formaction="/oidc/cancel-logout" so that clicking it routes
            // through our custom cancel handler instead of the OIDC
            // provider's /end_session/confirm handler.
            const promptPath = getPathFromLocation(prompt.interactionUrl);
            const promptRes = await agent.get(promptPath).redirects(0);
            expect(promptRes.status).toBe(200);

            // The cancel button must be a form submit (not a free-standing
            // button that does a client-side redirect) and must use
            // formaction="/oidc/cancel-logout" to bypass the OIDC
            // provider's /end_session/confirm handler.
            const cancelSubmitButton = promptRes.text.match(
                /<button[^>]*formaction="\/oidc\/cancel-logout"[^>]*>/
            );
            expect(cancelSubmitButton).not.toBeNull();
            // The form action must be the OIDC interaction confirm endpoint
            // (the same action URL the prompt returned), which is the
            // action used by the "Yes, sign out" button.
            expect(promptRes.text).toContain(`action="${prompt.actionUrl}"`);
        });

        test('cancelling the logout preserves the OIDC session', async () => {
            const agent = request.agent(server);

            const {idToken} = await performLoginFlow(agent, {
                username: 'user',
                password: 'userpassword',
            });

            const prompt = await startLogoutPrompt(agent, idToken);

            // Submit the cancel form
            const cancelRes = await agent
                .post('/oidc/cancel-logout')
                .type('form')
                .send({
                    logout: 'no',
                    xsrf: prompt.xsrf,
                    post_logout_redirect_uri: OIDC_POST_LOGOUT_URI,
                })
                .redirects(0);

            expect(cancelRes.status).toBe(303);

            // After cancelling, the user should still be logged in: a
            // follow-up probe of the userinfo endpoint with the original
            // session cookies should succeed.
            const probe = await probeAuthorization(agent);
            expect(probe.status).toBe(303);
            expect(isLoginInteractionRedirect(probe.location)).toBe(false);
        });

        test('GET /oidc/logout-redirect with logout=no preserves the query param in its redirect', async () => {
            // Defense in depth: the GET /oidc/logout-redirect handler is
            // also hit on the cancel path (e.g. when the OIDC client
            // redirects through it). When called with ?logout=no it must
            // redirect to the target URI without losing the ?logout=no
            // param, otherwise the client library's wasJustLoggedOut()
            // helper would assume the logout succeeded and wipe the OIDC
            // session from localStorage.
            const agent = request.agent(server);

            const res = await agent
                .get('/oidc/logout-redirect?logout=no')
                .redirects(0);

            expect(res.status).toBe(302);
            const location = new URL(res.headers.location as string, OIDC_REDIRECT_URI);
            expect(location.searchParams.get('logout')).toBe('no');
        });
    });
});
