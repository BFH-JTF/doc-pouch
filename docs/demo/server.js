// Minimal DocPouch Relying Party backend.
//
// In production you may replace this with any static-file server or
// serve the built `dist/` folder from nginx / caddy / etc.
//
// The only dynamic endpoint is `/api/oidc-client-config`, which tells
// the browser where the DocPouch server lives.  Everything else
// (OIDC, API calls, WebSocket) happens directly between the browser
// and DocPouch.

import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration (override with env vars)
// ---------------------------------------------------------------------------
const RP_PORT = parseInt(process.env.RP_PORT || '8080', 10);
const DOCPOUCH_URL = process.env.DOCPOUCH_URL || 'http://localhost:3030';
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${RP_PORT}/callback`;
const POST_LOGOUT_REDIRECT_URI = process.env.POST_LOGOUT_REDIRECT_URI || `http://localhost:${RP_PORT}/`;

function getClientConfig() {
    return {
        // The issuer is the DocPouch server's OIDC endpoint
        issuer: `${DOCPOUCH_URL}/oidc`,
        // Where the browser should call DocPouch APIs
        apiBaseUrl: DOCPOUCH_URL,
        // OIDC redirect / post-logout URIs (must match registered values)
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    };
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// Serve static assets (SPA — all routes fall back to index.html)
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/callback', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/api/oidc-client-config', (_req, res) => {
    res.json(getClientConfig());
});

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ok: true});
});

app.listen(RP_PORT, () => {
    console.log(`DocPouch RP template listening on http://localhost:${RP_PORT}`);
    console.log(`DocPouch server: ${DOCPOUCH_URL}`);
    console.log(`Redirect URI:    ${REDIRECT_URI}`);
    console.log(`Post-logout URI: ${POST_LOGOUT_REDIRECT_URI}`);
});
