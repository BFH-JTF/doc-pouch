# DocPouch

DocPouch is a light-weight, document-based database including user management. It provides a simple yet flexible way to
store and manage structured documents.

A client library can be found here: [docpouch-client](https://github.com/BFH-JTF/docpouch-client)

Ask AI about docPouch here: [![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/BFH-JTF/doc-pouch)

## Purpose and Use Cases

DocPouch is primarily intended for:
- **Development environments**: Ideal for prototyping and developing applications that need document storage
- **Testing environments**: Perfect for testing applications without setting up complex database systems
- **Secure internal environments**: Suitable for internal applications where security is not a major concern

> **Note**: DocPouch is not designed for high-performance production environments or applications requiring security
> features. The database is file and text-based, prioritizing simplicity and a small footprint over performance.
> Auth tokens are stored in localStorage for simplicity. This can be abused by Cross-Site Scripting.

DocPouch handles users, documents, and document structures.
### Users
A user entry describes a system user including the name, password, role, and email (if provided)

### Documents

Documents store the main data. They can be all sort of data objects as long as they can be express in JSON. They can
follow their own structure or follow an existing document structure.

Documents have access control settings:

- **Private**: Only the owner and administrators can access the document.
- **Shared with Group**: All users in the owner's group can read the document.
- **Shared with Department**: All users in the owner's department can read the document.
- **Public**: All authenticated users can read the document.

Owners can change these settings in the document editor.

#### Anonymous Documents

Documents can be created anonymously by setting the `anonymous` flag to `true` during creation. When a document is created
as anonymous:

- The document is owned by the admin user instead of the creating user
- The original creator cannot edit or delete the document after creation
- Only administrators can edit or delete anonymous documents
- The document content can still contain identifying information added by the user

This feature is useful for collecting feedback or other sensitive information where the submitter wants to remain anonymous
while still allowing administrators to manage the content.

##### Enabling Anonymous Documents

Anonymous document creation is **opt-in** and is controlled by the `ANONYMOUS_DOCUMENTS_ENABLED` environment variable.
When the flag is `false` (the default), `POST /docs/create` rejects any request body containing `"anonymous": true` with
HTTP `400` and the error code `ANONYMOUS_DOCUMENTS_DISABLED`.

When the flag is `true`:

- The OIDC session/access-token NeDB files are replaced by an in-memory store, so user login activity is not persisted
  to
  disk and cannot later be correlated with anonymous document creation.
- Document creation log lines are moved from `info` to `debug` and, for anonymous documents, the body of the log entry
  is redacted to a metadata-only summary (id, type, sub-type, sharing flags, owner). The full document content is never
  written to the application log.
- The original creator's user ID, name, email, IP and any other identifying metadata are never written to the
  application
  log in connection with an anonymous creation.

Operators running in this mode should additionally:

- Not set `LOG_LEVEL=debug` (the redaction in debug mode is metadata-only and does not protect the body of non-anonymous
  documents).
- Consider not persisting any other log sink (load balancer access logs, reverse-proxy logs) that would record the
  creator's identity alongside an anonymous request timestamp.

### Document Structures
Document structures describe how documents following this structure are structured and what information they hold.
They contain a separate DataElement for each field of the data structure in their `fields` property. Each field has
a stable machine-readable `name` and a human-readable `displayName` shown in the UI.

**Example for a document structure with two fields**
```
{
    "_id": "tt5vo04DN3jm8Bqe",
    "name": "City Info",
    "description": "A structure describing basic city information",
    "type": 99,
    "subType": 99,
    "fields": [
        {
            "name": "cityName",
            "displayName": "City name",
            "type": "string"
        },
        {
            "name": "inhabitants",
            "displayName": "# of inhabitants",
            "type": "number"
        }
    ]
}
```

#### Arrays of items

Arrays of items are specified using the type `array` and indicating the type of the array elements in `items`.

#### Referencing other document structures
Document structures can refer to other document structures to build more complex data interrelations.
To reference a document structure inside another structure, the `items` property of a field is used.

**Example for a document structure referencing another**
This structure consists of the name of the street plus an array of data structures named "Houses" described in the data
structure `g33vo0rPd3jmfBqe`.
The `items` field can therefore only be used in combination with the types `array` or `structure`.
```
{
    "_id": "tt5vo04DN3jm8Bqe",
    "name": "Street Info",
    "description": "A street with houses",
    "type": 99,
    "subType": 99,
    "fields": [
        {
            "name": "streetName",
            "displayName": "Street name",
            "type": "string"
        },
        {
            "name": "alternativeNames",
            "displayName": "Alternative names",
            "type": "array",
            "items": "string"
        },
        {
            "name": "houses",
            "displayName": "Houses",
            "type": "array",
            "items": "g33vo0rPd3jmfBqe"
        }
    ]
}
```
A fitting document structure for houses could look like this:
```
{
    "_id": "g33vo0rPd3jmfBqe",
    "name": "House Info",
    "description": "A single house",
    "type": 99,
    "subType": 99,
    "fields": [
        {
            "name": "hasFiberGlass",
            "displayName": "Has fiber glass connection",
            "type": "boolean"
        },
        {
            "name": "numInhabitants",
            "displayName": "Number of inhabitants",
            "type": "number"
        },
        {
            "name": "connectedToGasGrid",
            "displayName": "Is connected to the gas grid",
            "type": "boolean"
        }
    ]
}
```

#### Application in documents
Documents using a document structure have to structure their content like this:
```
{
  "content": {
    "structureID": [ID of used document structure],
    "structuredData": [object structured as dictated by document structure]
  }
}
```

## Getting Started with Docker

### Using Docker Compose (Recommended)

To run DocPouch using Docker Compose, create a `docker-compose.yml` file with the following content:

```yaml
services:
  doc-pouch:
    image: ghcr.io/bfh-jtf/doc-pouch:latest
    ports:
      - "3030:3030"
    volumes:
      - "./db:/app/db"
      - "./log:/app/log"
    environment:
      - PORT=3030
      - MEMORY_ONLY=false
    restart: unless-stopped
```

Then, run the following command to start the application:

```bash
docker compose up -d
```

### Using Docker CLI

Alternatively, you can run DocPouch directly using the Docker CLI:

```bash
docker run -d \
  --name doc-pouch \
  -p 3030:3030 \
  -v ./db:/app/db \
  -v ./log:/app/log \
  ghcr.io/bfh-jtf/doc-pouch:latest
```

### Configuration

DocPouch can be configured using environment variables. These can be set in your Docker Compose file, as CLI arguments,
or in a `.env` file when running locally.

#### Core Configuration

| Variable      | Description                                                                                          | Default       |
|---------------|------------------------------------------------------------------------------------------------------|---------------|
| `PORT`        | The port the server will listen on.                                                                  | `3030`        |
| `MEMORY_ONLY` | Set to `true` to use an in-memory database (data will be lost on restart).                           | `false`       |
| `PREFIX`      | Prefix for database filenames.                                                                       | `docpouch-`   |
| `LOG_LEVEL`   | Application log level. One of `debug`, `info`, `warn`, `error`.                                      | `info`        |
| `NODE_ENV`    | Node environment. When set to `production`, the server enforces secure OIDC cookies and CSP upgrade. | `development` |

#### Security Configuration

| Variable          | Description                                                                                               | Default                            |
|-------------------|-----------------------------------------------------------------------------------------------------------|------------------------------------|
| `JWT_SECRET`      | Secret key used to sign JWT tokens. **Change in production!**                                             | `ThisIsMyVeryOwnAndCreativeSecret` |
| `SESSION_TIMEOUT` | Session timeout for JWT tokens and OIDC sessions. Accepts duration strings like `24h`, `8h`, `30m`, `7d`. | `24h`                              |

#### CORS Configuration

| Variable          | Description                                     | Default                       |
|-------------------|-------------------------------------------------|-------------------------------|
| `ALLOWED_ORIGINS` | Comma-separated list of allowed origins (CORS). | `*` (all origins allowed)     |
| `ALLOWED_HEADERS` | Comma-separated list of allowed headers.        | `Content-Type, Authorization` |

#### OIDC Configuration

| Variable                        | Description                                                                                                         | Default                                       |
|---------------------------------|---------------------------------------------------------------------------------------------------------------------|-----------------------------------------------|
| `OIDC_ISSUER`                   | Base URL of the OIDC provider.                                                                                      | `http://localhost:3030`                       |
| `OIDC_REGISTRATION_TOKEN`       | Token required for dynamic OIDC client registration (initial access token).                                         | (none — must be set for OIDC use)             |
| `OIDC_REDIRECT_URI`             | Redirect URI for the built-in admin UI client. Leave unset to use the issuer root.                                  | `${OIDC_ISSUER}/`                             |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | Post-logout redirect URI for the built-in admin UI client. Falls back to `OIDC_REDIRECT_URI`.                       | `${OIDC_ISSUER}/`                             |
| `OIDC_COOKIE_KEY`               | Secret key used to encrypt/sign OIDC session cookies. **Change in production!**                                     | `docpouch-cookie-secret-change-in-production` |
| `OIDC_COOKIE_SECURE`            | Set to `true` when running the server directly with HTTPS. Leave unset when behind a TLS-terminating reverse proxy. | `false`                                       |

#### MCP Configuration

| Variable      | Description                                             | Default |
|---------------|---------------------------------------------------------|---------|
| `MCP_ENABLED` | Mount the MCP server at `/mcp`. Set `false` to disable. | `true`  |

#### Feature Flags

The server trusts `X-Forwarded-*` headers (`trust proxy: true`), so it works behind a reverse proxy out of the box.

#### Example Configuration

**Using Docker Compose:**

```yaml
services:
  doc-pouch:
    image: ghcr.io/bfh-jtf/doc-pouch:latest
    ports:
      - "3030:3030"
    volumes:
      - "./db:/app/db"
      - "./log:/app/log"
    environment:
      - PORT=3030
      - MEMORY_ONLY=false
      - PREFIX=myapp-
      - JWT_SECRET=your-secure-secret-here
      - SESSION_TIMEOUT=24h
      - ALLOWED_ORIGINS=https://example.com,https://app.example.com
    restart: unless-stopped
```

**Using .env file for local development:**

```bash
PORT=3030
MEMORY_ONLY=false
PREFIX=docpouch-
JWT_SECRET=your-development-secret
SESSION_TIMEOUT=24h
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
ALLOWED_HEADERS=Content-Type, Authorization, X-Requested-With
```

**Using Docker CLI:**

```bash
docker run -d \
  --name doc-pouch \
  -p 3030:3030 \
  -v ./db:/app/db \
  -v ./log:/app/log \
  -e JWT_SECRET=your-secure-secret \
  -e SESSION_TIMEOUT=24h \
  -e ALLOWED_ORIGINS=https://example.com \
  ghcr.io/bfh-jtf/doc-pouch:latest
```

### Persisting Data

To persist your data and logs, ensure you mount volumes for `/app/db` and `/app/log` as shown in the examples above.

### Initial Credentials

On the first start, DocPouch creates a default administrator account:

- **Username**: `admin`
- **Password**: `adminSecret`

> **Security Note**: Please change the administrator password immediately after the first login.

## API

DocPouch provides a RESTful API with an [OpenAPI documentation](https://bfh-jtf.github.io/doc-pouch/) and the following main endpoints:

### User Management
- `POST /users/login` - Authenticate a user and receive a JWT token
- `GET /users/list` - List user information (all users for admins, own info for regular users)
- `GET /users/whoami` - Get information about the current authenticated user
- `POST /users/create` - Create a new user (admin only)
- `PATCH /users/update/{userID}` - Update user information
- `DELETE /users/remove/{userID}` - Remove a user and all their documents (admin only)

### Document Management

- `GET /docs/list` - List all documents readable by the user (including public ones)
- `POST /docs/fetch` - Get documents based on a query object (including public ones)
- `POST /docs/create` - Create a new document
    - Optional `anonymous` parameter (boolean) - If true, document will be owned by admin user. Requires
      `ANONYMOUS_DOCUMENTS_ENABLED=true` on the server, otherwise the request is rejected with HTTP 400
      (`ANONYMOUS_DOCUMENTS_DISABLED`).
- `PATCH /docs/update/{documentID}` - Update an existing document
- `DELETE /docs/remove/{documentID}` - Remove a document

### Data Structure Management
- `GET /structures/list` - Get all data structures
- `POST /structures/create` - Create a new data structure (admin only)
- `PATCH /structures/update/{structureID}` - Update an existing data structure (admin only)
- `DELETE /structures/remove/{structureID}` - Remove a data structure (admin only)

### Database Management

- `GET /database/export` - Export database (admin only)
    - Query parameters:
        - `scope`: Export scope - `all` (default), `users`, `documents`, or `structures`
        - `format`: Export format - `zip` (default) or `json`
    - Example: `GET /database/export?scope=users&format=json`
- `POST /database/import` - Import database (admin only)
    - Form data:
        - `file`: The file to import (JSON or ZIP)
    - Body parameters:
        - `scope`: Import scope - `all` (default), `users`, `documents`, or `structures`
        - `mode`: Import mode - `replace` (default), `add`, or `skip`

### Miscellaneous

- `GET /version/check` - Returns the result of the latest update check against the GitHub repository.
  Returns `200` with `{ hasUpdate, currentVersion, latestVersion }` or `503` if no check has run yet.

All API endpoints (except login) require authentication using JWT tokens, OIDC tokens, or API keys. You can find an
OpenAPI
specification in the `docpouch_openAPI.yaml` file.

> **Note**: API endpoints use standard HTTP response codes: `200` (OK), `204` (No Content), `403` (Forbidden), etc.

## Authentication

DocPouch supports three authentication methods:

1. **JWT** - Direct login via `/users/login`, tokens expire in 24h by default
2. **API Keys** - Long-lived tokens for MCP clients and scripts, created via the admin UI
3. **OIDC** - Standard OAuth2/OIDC flow with built-in login page

See [`docs/authentication.md`](docs/authentication.md) for the full reference.

## OpenID Connect (OIDC)

DocPouch ships with a built-in OpenID Connect provider. Authentication is shared with JWT — clients can pick the
method that fits their use case, and both methods talk to the same user database.

The `docpouch-client` library handles the entire OIDC flow automatically. The shipped admin UI uses the same
library. See [`docs/authentication.md`](docs/authentication.md) for the full reference, including a step-by-step
description of the flows below.

### Endpoints

The OIDC provider is mounted at `/oidc` and follows the standard OpenID Connect / OAuth2 routes:

| Route                   | Purpose                                                          |
|-------------------------|------------------------------------------------------------------|
| `GET /oidc/auth`        | Authorization endpoint (DocPouch serves the login page)          |
| `POST /oidc/token`      | Token endpoint (authorization_code, refresh_token)               |
| `GET /oidc/userinfo`    | UserInfo endpoint                                                |
| `GET /oidc/jwks`        | JSON Web Key Set used to verify ID tokens                        |
| `GET /oidc/end_session` | RP-initiated logout                                              |
| `POST /oidc/revocation` | Token revocation                                                 |
| `POST /oidc/par`        | Pushed Authorization Requests                                    |
| `POST /oidc/reg`        | Dynamic client registration (requires `OIDC_REGISTRATION_TOKEN`) |
| `GET /oidc/reg/{id}`    | Read/update/delete a registered client                           |

In addition, the server exposes a few DocPouch-specific endpoints:

- `GET /api/oidc-client-config` - returns the OIDC config for the built-in admin UI client
  (`{ configured, issuer, clientId, redirectUri, postLogoutRedirectUri, scope }`).
- `GET /.well-known/openid-configuration` - discovery document (proxied to the OIDC provider).
- `GET /interaction/:uid` and `GET /interaction/:uid/details` - serve the login / consent / logout interaction
  pages that DocPouch hosts on behalf of the OIDC provider.
- `GET /oidc/logout-redirect` - clears the OIDC session cookies after `end_session` and redirects to the
  RP-supplied `post_logout_redirect_uri`.

### Built-in admin UI client

DocPouch automatically registers a fixed OIDC client (`client_id: docpouch-admin-ui`) for the bundled admin UI.
It uses PKCE (`token_endpoint_auth_method: none`) so the UI can log in without storing a client secret. The
redirect and post-logout URIs default to the issuer root, but can be overridden with `OIDC_REDIRECT_URI` and
`OIDC_POST_LOGOUT_REDIRECT_URI`. `GET /api/oidc-client-config` is what the UI uses to discover this client.

### Registering your own client

External tools (or you, when integrating DocPouch into your own application) register their own client through
dynamic client registration. You need an `OIDC_REGISTRATION_TOKEN` from the DocPouch administrator.

```ts
import DbPouchClient from 'docpouch-client';

const client = new DbPouchClient('http://localhost:3030', 3030);

await client.registerOidcClient({
  client_name: 'My App',
  redirect_uris: ['http://localhost:8080/callback'],
  post_logout_redirect_uris: ['http://localhost:8080/'],
  grant_types: ['authorization_code'],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_basic',
  application_type: 'web',
}, 'YOUR_REGISTRATION_TOKEN');
```

After registration you can also read, update, and delete the registration via the
`client.getOidcClient(...)`, `client.updateOidcClient(...)`, and `client.deleteOidcClient(...)` methods.

### Logout

For **JWT authentication**, use:

```ts
await client.logout();
// Clears tokens, disconnects WebSocket. No server-side session to destroy.
```

For **OIDC authentication**, use:

```ts
await client.logout();
// For OIDC, this redirects the browser to the provider's /end_session endpoint.
// The provider destroys the server-side session, redirects to the
// post_logout_redirect_uri, and DocPouch clears the remaining OIDC cookies
// via its /oidc/logout-redirect handler.
```

`docpouch-client.logout()` handles both authentication methods automatically — there is no need to build the
end_session URL yourself. The full flow is documented in [`docs/authentication.md`](docs/authentication.md#logout).

### Key Details

- **PKCE**: Handled automatically by `docpouch-client` (64-char verifier → SHA-256 → base64url S256 challenge).
- **Token refresh**: Automatic when `Date.now() >= tokenExpiry - 60s`.
- **Auth method**: `client.getAuthMethod()` returns `'jwt' | 'oidc' | 'none'`.
- **Check auth**: `client.isAuthenticated()` checks token validity based on method.
- **Supported scopes**: `openid`, `profile`, `email`, `offline_access`.
- **Discovery**: `GET /.well-known/openid-configuration` and `GET /oidc/jwks`.
- **Reverse proxy**: The OIDC provider is configured with `proxy: true` and `trust proxy: true` so that it works
  correctly behind nginx / Caddy / Traefik.

## Real-Time Updates

DocPouch supports WebSocket-based real-time updates using Socket.io. Events are triggered for documents, users,
and structures. See [`docs/socketIoApi.md`](docs/socketIoApi.md) for the full event reference.

To simplify integration, use the official client library: [docpouch-client](https://github.com/BFH-JTF/docpouch-client),
which handles authentication, connection, and event handling.

A complete, runnable Relying Party demo that integrates DocPouch via OIDC using `docpouch-client` is provided in
[`docs/demo`](docs/demo).

## MCP for AI Agents

DocPouch includes an embedded [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that allows AI
agents and LLM-powered tools to interact with documents, structures, and users. The MCP server is enabled by default at
`/mcp` and uses the same JWT/OIDC authentication as the REST API.

Quick connection example:

```bash
TOKEN=$(curl -s -X POST http://localhost:3030/users/login \
  -H "Content-Type: application/json" \
  -d '{"name":"admin","password":"your-password"}' | jq -r '.token')

curl -X POST http://localhost:3030/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

Set `MCP_ENABLED=false` to disable. See [`docs/mcp.md`](docs/mcp.md) for the full tool reference and security notes.

## Frontend UI

The DocPouch frontend provides an intuitive interface for managing documents, users, and data structures:

### Main Features
- **User Management**: Create, view, update, and delete user accounts (admin only)
- **Document Management**: View, edit, and delete documents with structured content
    - Multi-select and bulk delete of documents
    - Anonymous document creation (owned by admin)
- **Document Structure Management**: View document structures with various field types
- **Database Export / Import**: Export to JSON or ZIP; import from JSON (full or scoped) or ZIP
- **Update Notifications**: A background check against the GitHub release informs the user when a newer
  version is available
- **OIDC Login**: The built-in admin UI can log in via DocPouch's OIDC provider, in addition to username/password

The frontend automatically runs a one-time database consistency check on connect (admin only) and shows a warning
for documents whose owner or structure reference no longer exists.

## Support the Project

If you find DocPouch useful, consider supporting the project:

<p align="center">
  <a href="https://www.buymeacoffee.com/pantek">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee/tea&emoji=&slug=pantek&button_colour=40DCA5&font_colour=ffffff&font=Comic&outline_colour=000000&coffee_colour=FFDD00" alt="Buy me a coffee/tea" />
  </a>
</p>
