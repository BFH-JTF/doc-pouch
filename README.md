# DocPouch

DocPouch is a light-weight, document-based database including user management. It provides a simple yet flexible way to
store and manage structured documents.

A client library can be found here: [docpouch-client](https://github.com/BFH-JTF/docpouch-client)
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

### Document Structures
Document structures describe how documents following this structure are structured and what information they hold.
They contain a separate DataElement for each field of the data structure in their "fields" property.

**Example for a document structure with two fields**
```
{
    "_id": "tt5vo04DN3jm8Bqe",
    "title": "City Info",
    "fields": [
        {
            "name": "City name",
            "type": "string",
        },
        {
            "name": "# of inhabitants",
            "type": "number"
        }
    ]
}
```

#### Arrays of items
Arrays of items are specified using the type "array" and indicating the type of the array elements in "items".

#### Referencing other document structures
Document structures can refer to other document structures to build more complex data interrelations.
To reference a document structure inside another structure, the "items" property in the DataElement is used.

**Example for a document structure referencing another**  
This structure consists of the name of the street plus an array of data structures named "Houses" described in the data structure ```g33vo0rPd3jmfBqe```.
The "items" field can therefore only be used in combination with the types *array* or *structure*.
```
{
    "_id": "tt5vo04DN3jm8Bqe",
    "title": "Street Info",
    "fields": [
        {
            "name": "Street name",
            "type": "string",
        },
        {
            "name": "Alternative names",
            "type": "array",
            "items": "string"
        },
        {
            "name": "houses",
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
    "title": "House Info",
    "fields": [
        {
            "name": "Has fiber glass connection",
            "type": "boolean",
        },
        {
            "name": "Number of inhabitants",
            "type": "number",
        },
        {
            "name": "Is connected to the gas grid",
            "type": "boolean",
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

| Variable      | Description                                                                | Default     |
|---------------|----------------------------------------------------------------------------|-------------|
| `PORT`        | The port the server will listen on.                                        | `3030`      |
| `MEMORY_ONLY` | Set to `true` to use an in-memory database (data will be lost on restart). | `false`     |
| `PREFIX`      | Prefix for database filenames.                                             | `docpouch-` |

#### Security Configuration

| Variable     | Description                                                   | Default                            |
|--------------|---------------------------------------------------------------|------------------------------------|
| `JWT_SECRET` | Secret key used to sign JWT tokens. **Change in production!** | `ThisIsMyVeryOwnAndCreativeSecret` |

#### CORS Configuration

| Variable          | Description                                     | Default                       |
|-------------------|-------------------------------------------------|-------------------------------|
| `ALLOWED_ORIGINS` | Comma-separated list of allowed origins (CORS). | `*` (all origins allowed)     |
| `ALLOWED_HEADERS` | Comma-separated list of allowed headers.        | `Content-Type, Authorization` |

#### OIDC Configuration

| Variable                  | Description                                                                                                         | Default                                       |
|---------------------------|---------------------------------------------------------------------------------------------------------------------|-----------------------------------------------|
| `OIDC_ISSUER`             | Base URL of the OIDC provider.                                                                                      | `http://localhost:3030`                       |
| `OIDC_REGISTRATION_TOKEN` | Token required for dynamic OIDC client registration.                                                                | (none — must be set for OIDC use)             |
| `OIDC_COOKIE_KEY`         | Secret key used to encrypt/sign OIDC session cookies. **Change in production!**                                     | `docpouch-cookie-secret-change-in-production` |
| `OIDC_COOKIE_SECURE`      | Set to `true` when running the server directly with HTTPS. Leave unset when behind a TLS-terminating reverse proxy. | `false`                                       |

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
      - ALLOWED_ORIGINS=https://example.com,https://app.example.com
    restart: unless-stopped
```

**Using .env file for local development:**

```bash
PORT=3030
MEMORY_ONLY=false
PREFIX=docpouch-
JWT_SECRET=your-development-secret
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
- `POST /users/create` - Create a new user (admin only)
- `PATCH /users/update/{userID}` - Update user information
- `DELETE /users/remove/{userID}` - Remove a user and all their documents (admin only)

### Document Management

- `GET /docs/list` - List all documents readable by the user (including public ones)
- `POST /docs/fetch` - Get documents based on a query object (including public ones)
- `POST /docs/create` - Create a new document
- `PATCH /docs/update/{documentID}` - Update an existing document
- `DELETE /docs/remove/{documentID}` - Remove a document

### Data Structure Management
- `GET /structures/list` - Get all data structures
- `POST /structures/create` - Create a new data structure (admin only)
- `PATCH /structures/update/{structureID}` - Update an existing data structure (admin only)
- `DELETE /structures/remove/{structureID}` - Remove a data structure (admin only)

All API endpoints (except login) require authentication using JWT tokens. You can find an OpenAPI specification
in the `docpouch_openAPI.yaml` file.

> **Note**: API endpoints use standard HTTP response codes: `201` (Created), `204` (No Content), `403` (Forbidden), etc.

## OpenID Connect (OIDC)

DocPouch supports OIDC authentication. The `docpouch-client` library handles the entire flow automatically.

### Setup

**1. Register your client** (requires `OIDC_REGISTRATION_TOKEN` from admin):

```ts
import DbPouchClient from 'docpouch-client';

const client = new DbPouchClient('http://localhost:3030', 3030);

await client.registerOidcClient({
  client_name: 'My App',
  redirect_uris: ['http://localhost:8080/callback'],
  grant_types: ['authorization_code'],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_basic',
  application_type: 'web',
}, 'YOUR_REGISTRATION_TOKEN');
```

**2. Fetch OIDC config and initiate login:**

```ts
const config = await fetch('/api/oidc-client-config').then(r => r.json());
// Returns: { issuer, clientId, redirectUri, scope }
client.setOidcConfig(config);

// Triggers browser redirect to DocPouch login page
await client.loginWithOidc(config);
```

**3. Handle the callback** (on your redirect URI page):

```ts
const handled = await client.handleOidcCallback();
// Returns true if code+state present, exchanges for tokens
// Stores access_token, refresh_token, id_token in localStorage
```

**4. Restore session on page reload:**

```ts
if (client.restoreOidcSession()) {
  const token = client.getToken();
  // token is valid, proceed with authenticated requests
}
```

**5. Use for API calls (automatic token attachment and refresh):**

```ts
// All client methods automatically:
// - Call ensureValidOidcToken() before auth-required requests
// - Refresh token via /oidc/token if expired
// - Attach Authorization: Bearer {token} header
const docs = await client.listDocuments();
const users = await client.listUsers();
```

**6. Logout:**

For **JWT authentication**, use:
```ts
await client.logout();
// Clears tokens, disconnects WebSocket
// No server-side session to destroy
```

For **OIDC authentication**, use:
```ts
// Redirect to OIDC end_session endpoint
const config = await fetch('/api/oidc-client-config').then(r => r.json());
const logoutUrl = `${config.issuer}/end_session?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`;
window.location.href = logoutUrl;
// After logout, user is redirected back to post_logout_redirect_uri
// Client should detect logout and show login dialog
```

Or use the docpouch-client library's logout method which handles both:
```ts
await client.logout();
// For OIDC: automatically handles server session destruction
// For JWT: only client-side cleanup
```

### Key Details

- **PKCE**: Handled automatically (64-char verifier → SHA-256 → base64url S256 challenge)
- **Token refresh**: Automatic when `Date.now() >= tokenExpiry - 60s`
- **Auth method**: `client.getAuthMethod()` returns `'jwt' | 'oidc' | 'none'`
- **Check auth**: `client.isAuthenticated()` checks token validity based on method
- **Supported scopes**: `openid`, `profile`, `email`, `offline_access`
- **Discovery**: `GET /.well-known/openid-configuration` and `GET /oidc/jwks`

### Complete Example

```ts
import DbPouchClient from 'docpouch-client';

const client = new DbPouchClient('http://localhost:3030', 3030);

// On app init
const config = await fetch('/api/oidc-client-config').then(r => r.json());
client.setOidcConfig(config);

// Try to restore session or redirect to login
if (!client.restoreOidcSession()) {
  await client.loginWithOidc(config);
}

// Once authenticated
const token = client.getToken();
const docs = await client.listDocuments();
```

## Real-Time Updates

DocPouch supports WebSocket-based real-time updates using Socket.io. Events are triggered for documents, users,
and structures.

To simplify integration, use the official client library: [docpouch-client](https://github.com/BFH-JTF/docpouch-client),
which handles authentication, connection, and event handling.

## Frontend UI

The DocPouch frontend provides an intuitive interface for managing documents, users, and data structures:

### Main Features
- **User Management**: Create, view, update, and delete user accounts (admin only)
- **Document Management**: View, edit, and delete documents with structured content
- **Document Structure Management**: View document structures with various field types

## Support the Project

If you find DocPouch useful, consider supporting the project:

<p align="center">
  <a href="https://www.buymeacoffee.com/pantek">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee/tea&emoji=&slug=pantek&button_colour=40DCA5&font_colour=ffffff&font=Comic&outline_colour=000000&coffee_colour=FFDD00" alt="Buy me a coffee/tea" />
  </a>
</p>
