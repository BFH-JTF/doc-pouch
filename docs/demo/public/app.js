// Browser-side Relying Party logic.
//
// All authentication and API work is delegated to the `docpouch-client`
// library. The library is responsible for:
//   - building the authorization URL (with PKCE)
//   - storing the PKCE verifier + state
//   - exchanging the authorization code for tokens
//   - refreshing access tokens
//   - attaching the bearer token to outgoing requests
//
// This file is intentionally small so people can copy/paste it as a
// starting point for their own tool.

import DbPouchClient from 'docpouch-client';

const statusEl = document.getElementById('status');
const actionsEl = document.getElementById('actions');
const outputEl = document.getElementById('output');
const loginBtn = document.getElementById('btn-login');
const listBtn = document.getElementById('btn-list');
const logoutBtn = document.getElementById('btn-logout');

function setStatus(text, cls = '') {
    statusEl.textContent = text;
    statusEl.className = cls;
}

function setOutput(value) {
    outputEl.textContent = typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);
}

// 1. Load the OIDC config served by our tiny RP backend.
//    In a real app you can also hardcode it.
const config = await fetch('/api/oidc-client-config').then(r => r.json());

// 2. Construct the client. Host is the DocPouch server.
const apiBaseUrl = new URL(config.apiBaseUrl);
const client = new DbPouchClient(apiBaseUrl.hostname, Number(apiBaseUrl.port));

// 3. Make the config available to docpouch-client before any callback
//    is processed. (loginWithOidc sets it internally, but a fresh page
//    load after the redirect needs it explicitly.)
client.setOidcConfig(config);

// 4. If we are returning from the DocPouch login page, exchange the code
//    for tokens. handleOidcCallback() returns true when it handled the
//    `?code=...&state=...` query string.
const handled = await client.handleOidcCallback();
if (handled) {
    setStatus('Login successful.', 'ok');
}

// 5. Try to restore a session from localStorage (e.g. on a page reload
//    that is not the callback URL). This does not perform any network
//    call; it just re-hydrates the in-memory token state.
if (!handled && client.restoreOidcSession()) {
    setStatus('Session restored from storage.', 'ok');
}

// 6. Show UI based on the current auth state.
function refreshUi() {
    if (client.isAuthenticated()) {
        setStatus(`Authenticated (${client.getAuthMethod()})`, 'ok');
        actionsEl.style.display = 'block';
        loginBtn.style.display = 'none';
    } else {
        setStatus('Not authenticated.');
        actionsEl.style.display = 'block';
        loginBtn.style.display = '';
        listBtn.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

refreshUi();

// 7. Wire up the buttons.
loginBtn.addEventListener('click', async () => {
    try {
        // Redirects the browser to the DocPouch login page.
        await client.loginWithOidc(config);
    } catch (err) {
        setStatus(`Login failed: ${err}`, 'err');
    }
});

listBtn.addEventListener('click', async () => {
    try {
        // docpouch-client automatically refreshes the OIDC access token
        // if it is close to expiry before sending the request.
        const docs = await client.listDocuments();
        setOutput(docs);
    } catch (err) {
        setOutput(`Error: ${err}`);
    }
});

logoutBtn.addEventListener('click', async () => {
    // For OIDC, this redirects to DocPouch's /end_session endpoint,
    // which destroys the server-side session and then bounces back
    // to the post_logout_redirect_uri configured on the client.
    await client.logout();
});

// 8. React to logout events fired by the library (e.g. when returning
//    from /end_session).
client.onLogout(() => {
    refreshUi();
    setOutput('Logged out.');
});
