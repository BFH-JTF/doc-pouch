# DocPouch OIDC Relying Party demo

The smallest possible Relying Party (RP) that authenticates a user against
DocPouch using OpenID Connect.

Everything related to OIDC — building the auth URL, PKCE, the token exchange,
token refresh, and attaching the bearer token to API calls — is done by
[`docpouch-client`](https://github.com/BFH-JTF/docpouch-client). The demo
contains no hand-rolled OAuth code on purpose: it is meant as a starting
point for people who want to build their own tools on top of DocPouch.

## What you get

```
docs/demo/
├── package.json       # only two deps: docpouch-client + express
├── server.js          # tiny express server, serves the page + /callback + /api/oidc-client-config
├── register.js        # one-shot OIDC client registration helper
└── public/
    ├── index.html
    └── app.js         # the whole browser-side OIDC flow, in ~80 lines
```

## Prerequisites

- A running DocPouch server (default: `http://localhost:3030`) with OIDC
  enabled and an `OIDC_REGISTRATION_TOKEN` set. See
  [`../authentication.md`](../authentication.md) for the relevant env
  variables.
- Node.js 18+.

## Setup

```bash
cd docs/demo
npm install
```

## 1. Register the demo with DocPouch (one-time)

```bash
OIDC_REGISTRATION_TOKEN=… node register.js
```

This calls `client.registerOidcClient(...)` and prints the
`client_id` / `client_secret` returned by DocPouch. Copy them into the
`OIDC_CONFIG` block in `server.js` (or load them from env vars in a real
tool).

## 2. Start the demo

```bash
node server.js
```

It listens on `http://localhost:8080`.

## 3. Try the flow

1. Open `http://localhost:8080/` in your browser.
2. Click **Log in with DocPouch**. You are redirected to DocPouch's
   login page.
3. After a successful login, DocPouch redirects back to
   `http://localhost:8080/callback`. `client.handleOidcCallback()`
   exchanges the `code` for tokens.
4. Click **List documents** to call `/docs/list`. The access token is
   attached automatically; if it is close to expiry, `docpouch-client`
   refreshes it first.
5. Click **Log out**. `client.logout()` redirects to DocPouch's
   `/end_session` endpoint, which shows a confirmation page. Clicking
   **Yes, sign out** destroys the server-side session and redirects back
   with `?logout=yes`. `wasJustLoggedOut()` detects this and clears the
   stored tokens. Clicking **No, stay signed in** redirects back with
   `?logout=no` and the session is preserved.

## How the flow maps to docpouch-client

| Step in the flow                                | docpouch-client method                                 |
|-------------------------------------------------|--------------------------------------------------------|
| Server publishes the RP's OIDC config           | served at `/api/oidc-client-config` (static for now)   |
| Browser learns the config                       | `fetch('/api/oidc-client-config')`                     |
| Browser stores the config                       | `client.setOidcConfig(config)`                         |
| Detect completed/cancelled logout               | `client.wasJustLoggedOut()`                            |
| Browser triggers login                          | `client.loginWithOidc(config)`                         |
| Browser handles the redirect back               | `client.handleOidcCallback()`                          |
| Browser restores a session after a refresh      | `client.restoreOidcSession()`                          |
| Inspect auth state                              | `client.getAuthMethod()`, `client.isAuthenticated()`   |
| Call a DocPouch API                             | `client.listDocuments()` (or any other method)         |
| Make sure the token is fresh before an API call | `client.ensureValidOidcToken()` (called automatically) |
| Log out                                         | `client.logout()` / `client.logoutOidc()`              |
| React to logout                                 | `client.onLogout(cb)` / `client.onOidcLogout(cb)`      |

## Things you will need to change for your own tool

- **`OIDC_CONFIG.clientId` / `clientSecret`** – fill in the values from
  `register.js`. In production, load them from env vars or a secret
  manager; never commit them.
- **`OIDC_CONFIG.redirectUri`** – must match exactly what you register
  with DocPouch.
- **`OIDC_CONFIG.postLogoutRedirectUri`** – where DocPouch redirects
  after a successful logout. Must be listed in the client's
  `post_logout_redirect_uris`.
- **`ALLOWED_ORIGINS`** – make sure the DocPouch server allows your
  tool's origin, otherwise the browser blocks the API calls.
- **Static config vs per-user config** – the demo serves a single
  config for everyone. If you need different clients per tenant,
  register one client per tenant with `client.registerOidcClient(...)`
  and look it up by some user identifier.
- **What you do with the token** – `client.getToken()` returns the
  active access token. Use it however you need; for example to call
  DocPouch APIs that are not yet wrapped by `docpouch-client`, or to
  forward it to a downstream service.
