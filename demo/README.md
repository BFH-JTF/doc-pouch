# DocPouch Relying Party Template

A **full-featured, production-ready template** for building DocPouch Relying Parties (RPs). It demonstrates every major
`docpouch-client` capability — JWT and OIDC authentication, dynamic client registration, CRUD operations on documents,
structures, and users, real-time WebSocket sync, and server-driven runtime configuration — in a clean, well-documented
Vue + TypeScript application.

Use this as a **starting point** for your own tools. The code is intentionally modular: copy the composable into a React
app, swap the UI layer, or deploy the backend behind nginx.

---

## What you get

```
docs/demo/
├── package.json              # deps + scripts (vite, vue, express, docpouch-client)
├── vite.config.ts            # Vite build config
├── tsconfig.json             # TypeScript config
├── .gitignore                # ignores dist/ and node_modules/
├── server.js                 # tiny Express backend (serves SPA + /api/oidc-client-config)
├── register.js               # one-shot OIDC client registration helper
├── src/
│   ├── index.html            # SPA entry point
│   ├── main.ts               # Vue app bootstrap
│   ├── App.vue               # main UI (auth, CRUD, users, settings modals)
│   ├── types.ts              # shared TypeScript interfaces
│   ├── composables/
│   │   └── useDocPouch.ts    # ALL docpouch-client logic in one reactive composable
│   └── components/           # (add your own components here)
└── dist/                     # production build output (gitignored — run npm run build)
```

---

## Prerequisites

- A running DocPouch server (default: `http://localhost:3030`) with OIDC enabled and an `OIDC_REGISTRATION_TOKEN` set.
  See [`../authentication.md`](../authentication.md) for the relevant environment variables.
- Node.js 18+.

---

## Setup

```bash
cd docs/demo
npm install
```

## 1. Register the template with DocPouch (one-time, OIDC only)

```bash
OIDC_REGISTRATION_TOKEN=… node register.js
```

This calls `client.registerOidcClient(...)` and prints the `client_id` and `registration_access_token`. The template can
also register itself at runtime from the browser (see **Dynamic Registration** below), but running `register.js` once
gives you a known client ID if you prefer a static setup.

`register.js` accepts `DOCPOUCH_HOST`, `DOCPOUCH_PORT`, and `RP_PORT` env vars to override the defaults.

> **Note:** If you only need JWT (username/password) authentication, you can skip this step entirely.

## 2. Development mode (hot reload)

```bash
npm run dev
```

The Vite dev server starts on `http://localhost:8080`.

## 3. Production build & run

```bash
npm run build
npm start
```

`npm run build` compiles the Vue SPA into `dist/` (gitignored). `npm start` runs `server.js`, which serves the static
files and the `/api/oidc-client-config` endpoint.

---

## How the flow works

### 1. Configuration (server-driven with localStorage fallback)

On boot, the template fetches `/api/oidc-client-config` from its own backend. The Express server (`server.js`) reads
`DOCPOUCH_URL` from the environment and returns the OIDC issuer, API base URL, redirect URIs, and scopes. This lets the
same deployed binary connect to different DocPouch servers without recompilation.

If the endpoint is unavailable (e.g. opening `dist/index.html` directly) or returns `configured: false`, the template
falls back to the user-entered **Server Configuration** modal, which stores the DocPouch URL, port, and OIDC
registration
token in `localStorage`.

You can toggle between server-driven and manual config via the checkbox in the Server Configuration modal.

### 2. Authentication — two methods

The template supports both authentication methods provided by `docpouch-client`:

#### OIDC (tab 1)

The template does **not** require a hardcoded `client_id`. On first login, it calls `registerOidcClient()` with the
user's registration token. The returned `client_id` is persisted in `localStorage`. On subsequent logins, it calls
`updateOidcClient()` to keep the redirect URIs in sync with the current browser origin.

This pattern is essential for tools that may be served from multiple origins (localhost, Docker, staging, production).

After registration, the template triggers the standard OIDC authorization-code flow with PKCE:

1. `loginWithOidc()` builds the authorization URL and redirects the browser to DocPouch.
2. DocPouch authenticates the user and redirects back to `/callback`.
3. `initService()` → `client.initAuth()` detects the `code`/`state` params and calls `client.handleOidcCallback()` to
   exchange them for tokens.
4. `restoreOidcSession()` re-hydrates the token on subsequent page reloads.

> **One-call alternative:** `docpouch-client` ≥ 1.2.0 exposes `client.startOidcLogin(registrationToken?)`, which
> combines `fetchOidcClientConfig` → `ensureOidcClient` → `loginWithOidc` into a single call. The template keeps the
> manual orchestration for educational clarity, but production apps that just need "log in with DocPouch" can replace
> `loginWithOidc()`'s body with `await client.startOidcLogin(configToken)`.

#### JWT (tab 2)

For username/password authentication, the template calls `client.login({name, password})`. The returned token is stored
in `localStorage` under the library-managed `authToken` key (so `client.initAuth()` can restore it on the next page
load), and the auth method is persisted via `client.persistAuthMethod('jwt')`. On reload, `initService()` calls
`client.initAuth()` which reads the token back, then `client.getCurrentUser()` re-hydrates the `isAdmin` flag and
username. A 401 response during data load clears these keys and prompts for re-login.

### 3. CRUD Operations

Once authenticated, the template demonstrates:

| Operation                 | `docpouch-client` method            |
|---------------------------|-------------------------------------|
| List documents by type    | `fetchDocuments(query)`             |
| List all documents        | `listDocuments()`                   |
| Create document           | `createDocument(doc)`               |
| Update document           | `updateDocument(id, doc)`           |
| Delete document           | `removeDocument(id)`                |
| Create anonymous document | `createDocument({anonymous: true})` |
| List data structures      | `getStructures()`                   |
| Create data structure     | `createStructure(struct)`           |
| Update data structure     | `updateStructure(id, struct)`       |
| Delete data structure     | `removeStructure(id)`               |
| List users (admin)        | `listUsers()`                       |
| Create user (admin)       | `createUser(user)`                  |
| Update user (admin)       | `updateUser(id, user)`              |
| Delete user (admin)       | `removeUser(id)`                    |

The **Users** card is only visible when the logged-in user has `isAdmin: true` (for JWT) or when `listUsers()` succeeds
(for OIDC — a 403 response hides the card).

> **Note:** `createUser()` returns `I_UserDisplay` which uses the field name `username` (not `name` — that's only on
> `I_UserCreation` / `I_UserEntry`). The template reloads the user list after each mutation rather than relying on the
> returned shape, so this difference is transparent.

Use the **Typed / All** toggle in the Documents card to switch between `fetchDocuments({type:0, subType:0})` and
`listDocuments()`.

These are wrapped in the `useDocPouch` composable so the UI layer only sees reactive refs and async helpers.

### 4. Real-Time Sync

The template enables WebSocket synchronization via `setRealTimeSync(true)`. When enabled, the client receives live
events and automatically refreshes the document list. Toggle it with the 🔴 / ⚪ button in the header.

The DocPouch server emits the following event names (the `I_EventString` union in `docpouch-client` mirrors these):

| Event                   | Payload field      | When                                                    |
|-------------------------|--------------------|---------------------------------------------------------|
| `newDocument`           | `newDocument`      | A document was created                                  |
| `changedDocument`       | `changedDocument`  | A document was updated (incl. admin owner reassignment) |
| `removedDocument`       | `removedID`        | A document was deleted                                  |
| `newStructure`          | `newStructure`     | A data structure was created                            |
| `changedStructure`      | `changedStructure` | A data structure was updated                            |
| `removedStructure`      | `removedID`        | A data structure was deleted                            |
| `newUser`               | `newUser`          | A user was created                                      |
| `changedUser`           | `changedUser`      | A user was updated                                      |
| `removedUser`           | `removedID`        | A user was deleted                                      |
| `heartbeatPing`         | —                  | Periodic keepalive                                      |
| `databaseInconsistency` | `faultyDocuments`  | Admin-only: faulty docs detected on connect             |

> **Note:** `removedID` is the **payload field name** (the id of the removed entity), not an event name. The
> `I_EventString` type union still lists `removedID` for legacy reasons, but the server never emits it as an event.
>
> `databaseInconsistency` is emitted only to admin connections and is not yet part of `I_EventString` (the server
> casts it with `as any`). The template handles it defensively in `handleSocketEvent` and surfaces it as a
> non-blocking `dbWarning` banner.

### 5. Logout

The template uses `client.logout()`, which auto-detects the active auth method:

- **OIDC**: redirects to DocPouch's `/end_session` endpoint with `post_logout_redirect_uri` and `id_token_hint` (read
  internally from the stored OIDC session). The user sees a confirmation page:
    - **Yes, sign out** → redirects back with `?logout=yes`. `wasJustLoggedOut()` detects this and clears tokens.
    - **No, stay signed in** → redirects back with `?logout=no` and the session is preserved.
- **JWT**: clears the local token, disconnects the WebSocket, and resets the reactive state. No redirect needed.

`client.logout()` accepts an optional `LogoutOptions` (`{redirectUri?, idTokenHint?}`) to override the registered
post-logout redirect URI or ID token hint for OIDC logout. The template's `logout()` composable forwards this argument
through (`await logout({redirectUri: ...})`); omit it to use the values configured via `setOidcConfig`.

`onLogout(cb)`, `onOidcLogout(cb)`, and `onJwtLogout(cb)` callbacks are all registered in `initService()` so the UI
state stays in sync regardless of how logout is triggered (server-side session expiry, manual logout, etc.).
`onLogout` fires for any auth method; `onOidcLogout` and `onJwtLogout` are the method-specific companions.

---

## Architecture

### `useDocPouch.ts` — the composable

This is the **only file** that imports `docpouch-client`. It encapsulates:

- **State**: `isAuthenticated`, `authMethod`, `authError`, `loading`, `realtimeEnabled`, `isAdmin`, `userName`,
  `documents`, `structures`, `users`
- **Config**: `loadSettings()`, `saveSettings()`, `fetchServerConfig()`, `resolveBaseUrl()`, `normalizeBaseUrl()`
- **OIDC lifecycle**: `initService()`, `handleOidcCallback()` (fallback), `loginWithOidc()`, `ensureOidcClient()`
- **JWT lifecycle**: `loginWithJwt()`, JWT session restore in `initService()` via `client.initAuth()`
- **Data**: `loadData()`, `loadAllDocuments()`, `createDocument()`, `updateDocument()`, `removeDocument()`,
  `createStructure()`, `updateStructure()`, `removeStructure()`
- **Users (admin)**: `loadUsers()`, `createUser()`, `updateUser()`, `removeUser()`
- **Real-time**: `handleSocketEvent()`, `toggleRealtime()`
- **Errors**: `is401Error()` / `is403Error()` detection → automatic logout and friendly message
- **Lifecycle callbacks**: `onLogout()` and `onOidcLogout()` registered once per client instance

**To adapt this for your own tool**, copy `useDocPouch.ts` and modify:

- The `fetchDocuments` query (change `type` / `subType` to match your domain)
- The document form fields in `App.vue`
- Any additional `docpouch-client` methods you need

### URL Normalization

The template includes a `normalizeBaseUrl()` helper that:

1. Adds `http://` if no protocol is present
2. Strips trailing slashes
3. Appends the port only if it isn't already in the URL

This prevents the port-ignored bug that can occur when `docpouch-client` receives a bare hostname.

### JWT Session Persistence

When JWT login succeeds, the token is stored in `localStorage` under the `docpouch-client` library's canonical
`authToken` key, and the auth method is recorded via `client.persistAuthMethod('jwt')`. On page reload,
`initService()` → `client.initAuth()` reads that key and re-hydrates the client. Because `initAuth()` always returns
stub `isAdmin`/`userName` values, the template immediately calls `client.getCurrentUser()` (`/users/whoami`) to fetch
the real profile. A 401 response during data load clears these keys and prompts for re-login.

---

## Environment Variables

When running in production with `server.js`:

| Variable                   | Default                                | Description                                     |
|----------------------------|----------------------------------------|-------------------------------------------------|
| `RP_PORT`                  | `8080`                                 | Port this RP listens on                         |
| `DOCPOUCH_URL`             | `http://localhost:3030`                | Base URL of the DocPouch server                 |
| `REDIRECT_URI`             | `http://localhost:${RP_PORT}/callback` | OIDC redirect URI (must match registered value) |
| `POST_LOGOUT_REDIRECT_URI` | `http://localhost:${RP_PORT}/`         | Where to return after OIDC logout               |

When using `register.js`:

| Variable                  | Default            | Description                                    |
|---------------------------|--------------------|------------------------------------------------|
| `OIDC_REGISTRATION_TOKEN` | (required)         | Initial access token for `/oidc/reg`           |
| `DOCPOUCH_HOST`           | `http://localhost` | DocPouch server host                           |
| `DOCPOUCH_PORT`           | `3030`             | DocPouch server port                           |
| `RP_PORT`                 | `8080`             | Port the demo runs on (used for redirect URIs) |

Example:

```bash
DOCPOUCH_URL=https://docpouch.internal RP_PORT=3000 npm start
```

---

## Error Handling

The template demonstrates handling for:

- **Unreachable DocPouch server** — network errors bubble up as `authError`
- **Invalid registration token** — shown in the login modal
- **Expired OIDC session** — `restoreOidcSession()` returns `false`; user is prompted to log in again
- **Expired JWT token** — `initAuth()` returns `method: 'none'`; stored token is cleared on the next 401
- **401 during API call** — `is401Error()` catches it, clears the token, and shows the login modal
- **403 when listing users** — `is403Error()` hides the Users card (non-admin user)
- **Failed callback** — invalid `state` or expired `code` is caught and displayed
- **Logout cancellation** — `wasJustLoggedOut()` distinguishes `?logout=yes` from `?logout=no`

---

## Adapting this template

### Change the framework

The `useDocPouch.ts` composable uses only Vue's `ref` / `computed` for reactivity. To use it in React:

```tsx
import {useEffect, useState} from 'react';
import {initService, isAuthenticated, documents, loadData} from './composables/useDocPouch';

export default function App() {
  const [auth, setAuth] = useState(isAuthenticated.value);
  useEffect(() => {
    const unsub = watch(isAuthenticated, v => setAuth(v));
    initService();
    return unsub;
  }, []);
  // ...
}
```

Or simply use the underlying `DocPouchClient` directly — the composable is sugar, not magic.

### Add more docpouch-client methods

```ts
// Inside useDocPouch.ts
export async function listAllUsers() {
    if (!client) return [];
    return await client.listUsers();
}
```

### Deploy behind a reverse proxy

Build with `npm run build`, then serve `dist/` from nginx/caddy. The only dynamic endpoint your proxy needs to forward
is `/api/oidc-client-config`.

### Build an MCP (AI agent) client

If you're building an AI-agent client instead of a web RP, see [`../mcp.md`](../mcp.md) for the Model Context Protocol
integration. The MCP server runs at `/mcp` on the DocPouch host and does not require OIDC.

---

## Security Notes

- The OIDC registration token is stored in `localStorage` for convenience. In a high-security deployment, prompt the
  user once and store it in a more secure mechanism (e.g. encrypted localStorage, or server-side session).
- The `client_id` and JWT token are also stored in `localStorage`. This is standard for SPAs using OIDC with
  `token_endpoint_auth_method: 'none'` (PKCE), but be aware of XSS risks.
- Never commit real `OIDC_REGISTRATION_TOKEN` values to version control.

---

## How the flow maps to docpouch-client

| Step in the flow                                | docpouch-client method                                                                            |
|-------------------------------------------------|---------------------------------------------------------------------------------------------------|
| Server publishes the RP's OIDC config           | served at `/api/oidc-client-config`                                                               |
| Browser learns the config                       | `fetch('/api/oidc-client-config')` or `client.fetchOidcClientConfig()`                            |
| Browser stores the config                       | `client.setOidcConfig(config)`                                                                    |
| Dynamic client registration                     | `client.registerOidcClient(registration, token?)`                                                 |
| Read / update / delete a dynamic registration   | `client.getOidcClient(id, token?)` / `updateOidcClient(id, ...)` / `deleteOidcClient(id, token?)` |
| Register-or-update convenience (cached)         | `client.ensureOidcClient(redirectUri, token?, options?)`                                          |
| One-call OIDC login (config + register + login) | `client.startOidcLogin(token?)`                                                                   |
| JWT login (username/password)                   | `client.login({name, password})`                                                                  |
| Detect completed/cancelled OIDC logout          | `client.wasJustLoggedOut()`                                                                       |
| Browser triggers OIDC login                     | `client.loginWithOidc(config)`                                                                    |
| Browser handles the OIDC redirect back          | `client.handleOidcCallback()`                                                                     |
| Browser restores an OIDC session after refresh  | `client.restoreOidcSession()`                                                                     |
| Browser restores a JWT session after refresh    | `client.initAuth()` (reads `localStorage.authToken`)                                              |
| Re-hydrate `isAdmin` / `userName` after restore | `client.getCurrentUser()` (`/users/whoami`)                                                       |
| Inspect auth state                              | `client.getAuthMethod()`, `client.isAuthenticated()`                                              |
| Read / set the active token                     | `client.getToken()` / `client.setToken(token)`                                                    |
| Call a DocPouch API                             | `client.fetchDocuments()` / `createDocument()` / etc.                                             |
| Make sure the token is fresh before an API call | `client.ensureValidOidcToken()` (called automatically)                                            |
| Enable real-time updates                        | `client.setRealTimeSync(true)`                                                                    |
| React to server-side changes                    | Constructor callback (`newDocument`, `changedDocument`, `removedDocument`, …)                     |
| React to logout (any method)                    | `client.onLogout(cb)`                                                                             |
| React to OIDC logout specifically               | `client.onOidcLogout(cb)`                                                                         |
| React to JWT logout specifically                | `client.onJwtLogout(cb)`                                                                          |
| Read the registered post-logout redirect URI    | `client.getPostLogoutRedirectUri()`                                                               |
| Library version                                 | `client.getVersion()`                                                                             |
| Log out (auto-detects OIDC vs JWT)              | `client.logout(options?)` / `client.logoutOidc(options?)` / `client.logoutJwt()`                  |

---

## Troubleshooting

**"Login failed: unauthorized" (OIDC)**
→ Check that `OIDC_REGISTRATION_TOKEN` is correct and that DocPouch's `ALLOWED_ORIGINS` includes your RP origin.

**"Invalid user or password" (JWT)**
→ The default admin user created by DocPouch is `admin` / `adminSecret`. Change it immediately in production.

**"Failed to load data"**
→ Check the browser's Network tab. If requests go to `localhost` instead of `localhost:3030`, verify the URL and port in
Server Settings. Use `normalizeBaseUrl()` to debug.

**"Socket connection error"**
→ DocPouch may not have WebSocket enabled, or the port is blocked. Check the DocPouch server logs.

**"Client update failed, re-registering"**
→ This is normal if the redirect URI changed (e.g. you switched from `localhost:8080` to a different port). The template
automatically re-registers.

**Users card not visible**
→ The card only appears for admin users. JWT login sets `isAdmin` from the login response. For OIDC, the template
attempts `listUsers()` and hides the card on 403.

**`/api/oidc-client-config` returns `configured: false`**
→ The DocPouch server's `OIDC_ISSUER` env var is not set. Set it in `.env` and restart the server, or use the manual
Server Configuration modal as a fallback.

**"MCP server not found at /mcp"**
→ The DocPouch server disables the MCP endpoint when `MCP_ENABLED=false` is set in the environment. Leave it unset (or
set it to `true`) to expose `/mcp`.

**Orange "Database inconsistency detected" banner**
→ Admin-only. The DocPouch server emits a `databaseInconsistency` WebSocket event on connect when faulty documents
(invalid owner or `type` / `subType`) are detected. Open the bundled admin UI to review and repair them, then dismiss
the banner with the ✕ button.

---

## License

Same as DocPouch — see root `LICENSE`.