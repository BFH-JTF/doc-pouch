# DocPouch Relying Party Template

A **full-featured, production-ready template** for building DocPouch Relying Parties (RPs). It demonstrates every major
`docpouch-client` capability — OIDC authentication, dynamic client registration, CRUD operations, real-time WebSocket
sync, and runtime server configuration — in a clean, well-documented Vue + TypeScript application.

Use this as a **starting point** for your own tools. The code is intentionally modular: copy the composable into a React
app, swap the UI layer, or deploy the backend behind nginx.

---

## What you get

```
docs/demo/
├── package.json              # deps + scripts (vite, vue, express, docpouch-client)
├── vite.config.ts            # Vite build config
├── tsconfig.json             # TypeScript config
├── server.js                 # tiny Express backend (serves SPA + /api/oidc-client-config)
├── register.js               # one-shot OIDC client registration helper
├── src/
│   ├── index.html            # SPA entry point
│   ├── main.ts               # Vue app bootstrap
│   ├── App.vue               # main UI (auth, CRUD, settings modals)
│   ├── types.ts              # shared TypeScript interfaces
│   ├── composables/
│   │   └── useDocPouch.ts   # ALL docpouch-client logic in one reactive composable
│   └── components/           # (add your own components here)
└── dist/                     # production build output
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

## 1. Register the template with DocPouch (one-time)

```bash
OIDC_REGISTRATION_TOKEN=… node register.js
```

This calls `client.registerOidcClient(...)` and prints the `client_id` and `registration_access_token`. The template can
also register itself at runtime from the browser (see **Dynamic Registration** below), but running `register.js` once
gives you a known client ID if you prefer a static setup.

## 2. Development mode (hot reload)

```bash
npm run dev
```

The Vite dev server starts on `http://localhost:8080`.

## 3. Production build

```bash
npm run build
npm start
```

`npm run build` compiles the Vue SPA into `dist/`. `npm start` runs `server.js`, which serves the static files and the
`/api/oidc-client-config` endpoint.

---

## How the flow works

### 1. Configuration

When the page loads, it checks `localStorage` for a previously saved DocPouch URL, port, and OIDC registration token. If
none exist, a **Server Configuration** modal prompts the user. This lets the same deployed binary connect to different
DocPouch servers without recompilation.

### 2. Dynamic OIDC Registration

The template does **not** require a hardcoded `client_id`. On first login, it calls `registerOidcClient()` with the
user's registration token. The returned `client_id` is persisted in `localStorage`. On subsequent logins, it calls
`updateOidcClient()` to keep the redirect URIs in sync with the current browser origin.

This pattern is essential for tools that may be served from multiple origins (localhost, Docker, staging, production).

### 3. OIDC Authentication

After registration, the template triggers the standard OIDC authorization-code flow with PKCE:

1. `loginWithOidc()` builds the authorization URL and redirects the browser to DocPouch.
2. DocPouch authenticates the user and redirects back to `/callback`.
3. `handleOidcCallback()` exchanges the `code` for tokens.
4. `restoreOidcSession()` re-hydrates the token on page reloads.

All of this is delegated to `docpouch-client`; no hand-rolled OAuth code exists in the template.

### 4. CRUD Operations

Once authenticated, the template demonstrates:

| Operation                 | `docpouch-client` method  |
|---------------------------|---------------------------|
| List documents with query | `fetchDocuments(query)`   |
| Create document           | `createDocument(doc)`     |
| Update document           | `updateDocument(id, doc)` |
| Delete document           | `removeDocument(id)`      |
| List data structures      | `getStructures()`         |
| Create data structure     | `createStructure(struct)` |

These are wrapped in the `useDocPouch` composable so the UI layer only sees reactive refs and async helpers.

### 5. Real-Time Sync

The template enables WebSocket synchronization via `setRealTimeSync(true)`. When enabled, the client receives live
events (`newDocument`, `changedDocument`, `removedID`, etc.) and automatically refreshes the document list. Toggle it
with the 🔴 / ⚪ button in the header.

### 6. Logout

For OIDC, `logout()` redirects to DocPouch's `/end_session` endpoint. The user sees a confirmation page:

- **Yes, sign out** → redirects back with `?logout=yes`. `wasJustLoggedOut()` detects this and clears tokens.
- **No, stay signed in** → redirects back with `?logout=no` and the session is preserved.

---

## Architecture

### `useDocPouch.ts` — the composable

This is the **only file** that imports `docpouch-client`. It encapsulates:

- **State**: `isAuthenticated`, `documents`, `structures`, `authError`, `loading`, `realtimeEnabled`
- **Lifecycle**: `initService()`, `handleOidcCallback()`, `loginWithOidc()`, `logout()`
- **Data**: `loadData()`, `createDocument()`, `updateDocument()`, `removeDocument()`, `createStructure()`
- **Config**: `loadSettings()`, `saveSettings()`, `normalizeBaseUrl()`
- **Errors**: `is401Error()` detection → automatic logout and friendly message

**To adapt this for your own tool**, copy `useDocPouch.ts` and modify:

- The `fetchDocuments` query (change `type` / `subType` to match your domain)
- The document form fields in `App.vue`
- Any additional `docpouch-client` methods you need (`listUsers`, `createUser`, etc.)

### URL Normalization

The template includes a `normalizeBaseUrl()` helper that:

1. Adds `http://` if no protocol is present
2. Strips trailing slashes
3. Appends the port only if it isn't already in the URL

This prevents the port-ignored bug that can occur when `docpouch-client` receives a bare hostname.

---

## Environment Variables

When running in production with `server.js`:

| Variable                   | Default                          | Description                                     |
|----------------------------|----------------------------------|-------------------------------------------------|
| `RP_PORT`                  | `8080`                           | Port this RP listens on                         |
| `DOCPOUCH_URL`             | `http://localhost:3030`          | Base URL of the DocPouch server                 |
| `REDIRECT_URI`             | `http://localhost:8080/callback` | OIDC redirect URI (must match registered value) |
| `POST_LOGOUT_REDIRECT_URI` | `http://localhost:8080/`         | Where to return after OIDC logout               |

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
- **401 during API call** — `is401Error()` catches it, clears the token, and shows the login modal
- **Failed callback** — invalid `state` or expired `code` is caught and displayed
- **Logout cancellation** — `wasJustLoggedOut()` distinguishes `?logout=yes` from `?logout=no`

---

## Adapting this template

### Change the framework

The `useDocPouch.ts` composable uses only Vue's `ref` / `computed` for reactivity. To use it in React:

```tsx
import { useEffect, useState } from 'react';
import { initService, isAuthenticated, documents, loadData } from './composables/useDocPouch';

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

---

## Security Notes

- The OIDC registration token is stored in `localStorage` for convenience. In a high-security deployment, prompt the
  user once and store it in a more secure mechanism (e.g. encrypted localStorage, or server-side session).
- The `client_id` is also stored in `localStorage`. This is standard for SPAs using OIDC with
  `token_endpoint_auth_method: 'none'` (PKCE), but be aware of XSS risks.
- Never commit real `OIDC_REGISTRATION_TOKEN` values to version control.

---

## How the flow maps to docpouch-client

| Step in the flow                                | docpouch-client method                                  |
|-------------------------------------------------|---------------------------------------------------------|
| Server publishes the RP's OIDC config           | served at `/api/oidc-client-config`                     |
| Browser learns the config                       | `fetch('/api/oidc-client-config')`                      |
| Browser stores the config                       | `client.setOidcConfig(config)`                          |
| Dynamic client registration                     | `client.registerOidcClient(...)`                        |
| Update existing client registration             | `client.updateOidcClient(...)`                          |
| Detect completed/cancelled logout               | `client.wasJustLoggedOut()`                             |
| Browser triggers login                          | `client.loginWithOidc(config)`                          |
| Browser handles the redirect back               | `client.handleOidcCallback()`                           |
| Browser restores a session after a refresh      | `client.restoreOidcSession()`                           |
| Inspect auth state                              | `client.getAuthMethod()`, `client.isAuthenticated()`    |
| Call a DocPouch API                             | `client.fetchDocuments()` / `createDocument()` / etc.   |
| Make sure the token is fresh before an API call | `client.ensureValidOidcToken()` (called automatically)  |
| Enable real-time updates                        | `client.setRealTimeSync(true)`                          |
| React to server-side changes                    | Constructor callback (`newDocument`, `changedDocument`) |
| Log out                                         | `client.logout()` / `client.logoutOidc()`               |
| React to logout                                 | `client.onLogout(cb)` / `client.onOidcLogout(cb)`       |

---

## Troubleshooting

**"Login failed: unauthorized"**
→ Check that `OIDC_REGISTRATION_TOKEN` is correct and that DocPouch's `ALLOWED_ORIGINS` includes your RP origin.

**"Failed to load data"**
→ Check the browser's Network tab. If requests go to `localhost` instead of `localhost:3030`, verify the URL and port in
Server Settings. Use `normalizeBaseUrl()` to debug.

**"Socket connection error"**
→ DocPouch may not have WebSocket enabled, or the port is blocked. Check the DocPouch server logs.

**"Client update failed, re-registering"**
→ This is normal if the redirect URI changed (e.g. you switched from `localhost:8080` to a different port). The template
automatically re-registers.

---

## License

Same as DocPouch — see root `LICENSE`.
