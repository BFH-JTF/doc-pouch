// Minimal DocPouch Relying Party using OIDC and the docpouch-client library.
//
// What this does:
//   1. Serves a tiny static page on http://localhost:8080/
//   2. The page triggers an OIDC login against the DocPouch server
//      at http://localhost:3030 (configurable below).
//   3. DocPouch handles the login, redirects back to /callback, where
//      docpouch-client exchanges the code for tokens.
//   4. After login, the page calls the DocPouch API (e.g. /docs/list)
//      using the same client instance.
//
// The whole flow is driven by docpouch-client methods:
//   - client.setOidcConfig(config)
//   - client.loginWithOidc(config)
//   - client.handleOidcCallback()
//   - client.restoreOidcSession()
//   - client.getAuthMethod() / client.isAuthenticated() / client.getToken()
//   - client.logout() / client.logoutOidc()
//   - client.listDocuments() (or any other API method)

import express from 'express';
import DbPouchClient from 'docpouch-client';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const DOCPOUCH_HOST = 'http://localhost';
const DOCPOUCH_PORT = 3030;
const RP_PORT = 8080;
const REDIRECT_URI = `http://localhost:${RP_PORT}/callback`;
const POST_LOGOUT_REDIRECT_URI = `http://localhost:${RP_PORT}/`;

const OIDC_CONFIG = {
    issuer: `${DOCPOUCH_HOST}:${DOCPOUCH_PORT}`,
    clientId: 'demo-rp',
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
};

// Reuse a single client across requests.
const client = new DbPouchClient(DOCPOUCH_HOST, DOCPOUCH_PORT);

// Expose the config to the browser. In a real app, serve this per-client
// (or read it from your config service) and never hardcode secrets.
function getClientConfig() {
    return {
        ...OIDC_CONFIG,
        // Tell the browser where the DocPouch server is so it can call
        // /docs/list and friends after login.
        apiBaseUrl: `${DOCPOUCH_HOST}:${DOCPOUCH_PORT}`,
    };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// Serve the demo HTML.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// The OIDC provider redirects here after a successful login.
app.get('/callback', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint the browser fetches to learn its OIDC config.
app.get('/api/oidc-client-config', (req, res) => {
    res.json(getClientConfig());
});

// Example of a server-to-server call using the same client.
// (Not strictly needed for the browser flow, but shows how the
// client can be used from Node as well.)
app.get('/api/whoami', async (req, res) => {
    try {
        // `ensureValidOidcToken` returns a fresh access token (refreshing
        // it if it is about to expire).
        await client.ensureValidOidcToken();
        // Use the API exposed by the DocPouch server. docpouch-client
        // attaches the bearer token automatically.
        const docs = await client.listDocuments();
        res.json({authenticated: true, documentCount: docs.length});
    } catch (err) {
        res.status(401).json({authenticated: false, error: String(err)});
    }
});

app.listen(RP_PORT, () => {
    console.log(`DocPouch OIDC RP demo listening on http://localhost:${RP_PORT}`);
    console.log(`Redirect URI: ${REDIRECT_URI}`);
    console.log(`Make sure DocPouch is running on ${DOCPOUCH_HOST}:${DOCPOUCH_PORT}`);
});
