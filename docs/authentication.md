# Authentication in DocPouch

DocPouch provides two authentication methods that share the same user database (NeDB):

1. **Direct Login (JWT)** - Simple token-based auth, client builds own login UI
2. **OpenID Connect (OIDC)** - Standard OAuth2/OIDC flow with DocPouch's login page

Both methods can coexist simultaneously. Clients choose based on their needs.

---

## Option 1: Direct Login (JWT)

**Best for**: Simple integrations, SPAs, when you want full control over the login UI.

### How it works

1. Client builds their own login form
2. POST credentials to `/users/login`
3. Receive JWT token in response
4. Use token in `Authorization: Bearer <token>` header for API requests

### API Usage

```bash
# Login
curl -X POST http://localhost:3030/users/login \
  -H "Content-Type: application/json" \
  -d '{"name": "admin", "password": "yourpassword"}'

# Response
# {
#   "token": "eyJhbGci...",
#   "isAdmin": false,
#   "userName": "admin"
# }

# Use token for API calls
curl http://localhost:3030/docs/list \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get information about the current user
curl http://localhost:3030/users/whoami \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### For JavaScript apps

```javascript
// Login
const response = await fetch('http://localhost:3030/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'admin', password: 'password' })
});
const { token, isAdmin, userName } = await response.json();

// Store token (localStorage, sessionStorage, or memory)
localStorage.setItem('authToken', token);

// Use in API calls
const apiResponse = await fetch('http://localhost:3030/docs/list', {
    headers: { 'Authorization': `Bearer ${token}` }
});

// Get information about the current user
const userResponse = await fetch('http://localhost:3030/users/whoami', {
    headers: { 'Authorization': `Bearer ${token}` }
});
const userInfo = await userResponse.json();
```

### Pros/Cons

**Pros**: Simple (single API call), full UI control, no redirects
**Cons**: Token storage security (XSS risk with localStorage), no standard discovery

---

## Option 2: OpenID Connect (OIDC)

**Best for**: Standard compliance, when you want to use DocPouch's login page, or integrate with other OIDC systems.

### Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Client App     │      │   DocPouch OIDC  │      │    DocPouch      │
│   (your app)    │─────▶│   Provider       │─────▶│   NeDB Users     │
│                  │      │   (oidc-provider)│      │                  │
└──────────────────┘      └──────────────────┘      └──────────────────┘
        │                         │
        │   1. Register client   │
        │   2. Redirect to login │ (DocPouch serves login page!)
        │   3. Token exchange    │
        │   4. Access token      │
        └────────────────────────┘
```

### Step 1: Register Your Client

Requires a registration token (contact admin for `OIDC_REGISTRATION_TOKEN`):

```bash
curl -X POST http://localhost:3030/oidc/reg \
  -H "Authorization: Bearer YOUR_REGISTRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My App",
    "redirect_uris": ["http://localhost:8080/callback"],
    "response_types": ["code"],
    "grant_types": ["authorization_code"],
    "token_endpoint_auth_method": "client_secret_basic"
  }'
```

**Response**:
```json
{
  "client_id": "abc123...",
  "client_secret": "secret456...",
  "registration_access_token": "token...",
  "registration_client_uri": "..."
}
```

### Step 2: Initiate Authorization Flow

Redirect user to DocPouch's login page:

```
https://localhost:3030/oidc/auth?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=http://localhost:8080/callback&
  response_type=code&
  scope=openid%20profile&
  state=RANDOM_STRING&
  code_challenge=PKCE_CHALLENGE&
  code_challenge_method=S256
```

**DocPouch serves a login page** - no need to build one!

### Step 3: Handle the Callback

After login, user is redirected back with an authorization code:

```javascript
// Parse the callback URL
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

// Verify state matches what you sent (CSRF protection)
// Then exchange code for tokens
const tokenResponse = await fetch('http://localhost:3030/oidc/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: 'http://localhost:8080/callback',
        client_id: 'YOUR_CLIENT_ID',
        client_secret: 'YOUR_CLIENT_SECRET',
        code_verifier: 'YOUR_PKCE_VERIFIER' // If using PKCE
    })
});

const tokens = await tokenResponse.json();
// tokens.access_token, tokens.refresh_token, tokens.id_token
```

### Step 4: Use the Access Token

```javascript
// Get user info
const userInfo = await fetch('http://localhost:3030/oidc/me', {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
});

// Call DocPouch APIs
const docs = await fetch('http://localhost:3030/docs/list', {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
});
```

### Step 5: Refresh Tokens (Optional)

```javascript
const refreshResponse = await fetch('http://localhost:3030/oidc/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'YOUR_CLIENT_ID',
        client_secret: 'YOUR_CLIENT_SECRET'
    })
});
```

### OIDC Discovery

```bash
# Get OpenID Connect configuration
curl http://localhost:3030/.well-known/openid-configuration

# Get JSON Web Key Set for token verification
curl http://localhost:3030/oidc/jwks
```

---

## Security Comparison

| Feature | Direct Login (JWT) | OIDC |
|---------|-------------------|------|
| Login UI | Client builds it | **DocPouch provides it** ✓ |
| Complexity | Simple (1 API call) | Moderate (redirects, token exchange) |
| Token storage | Client's choice | Standard (access + refresh tokens) |
| PKCE support | N/A | Yes (recommended for SPAs) |
| Discovery | None | `.well-known/openid-configuration` ✓ |
| SSO across apps | No | Yes ✓ |
| Standard compliance | Custom | OIDC/OAuth2 standard ✓ |

---

## Recommendation

- **Simple integrations / want full UI control**: Use **Option 1 (JWT)**
- **Standard compliance / want our login page / SSO**: Use **Option 2 (OIDC)**

---

## Scopes Reference

**The following are the only scopes supported by docPouch.** No other scopes are accepted.

| Scope            | Description                                       |
|------------------|---------------------------------------------------|
| `openid`         | OpenID Connect authentication (required for OIDC) |
| `profile`        | Include `name` in the user info claims            |
| `email`          | Include `email` in the user info claims           |
| `offline_access` | Issue refresh tokens                              |

The `sub` claim is always included in user info responses regardless of scope. The `profile` and `email` scopes control
whether `name` and `email` are included in the `/oidc/me` user info endpoint response.

---

## Environment Variables

| Variable                  | Description                                                                        | Default                                       |
|---------------------------|------------------------------------------------------------------------------------|-----------------------------------------------|
| `OIDC_REGISTRATION_TOKEN` | Token for client registration                                                      | (required)                                    |
| `OIDC_ISSUER`             | Base URL of the OIDC provider                                                      | `http://localhost:3030`                       |
| `OIDC_COOKIE_KEY`         | Secret for session cookies                                                         | `docpouch-cookie-secret-change-in-production` |
| `OIDC_COOKIE_SECURE`      | Set to `true` when running directly with HTTPS; leave unset behind a reverse proxy | `false`                                       |

Copy `.env.example` to `.env` and configure these values.

---

## Troubleshooting

### OIDC: "Invalid client" error
- Verify `client_id` is correct
- Check that the client hasn't been deleted
- Ensure `redirect_uri` matches exactly what was registered

### OIDC: PKCE verification failed
- Ensure `code_verifier` matches the original `code_challenge`
- Check that S256 method is used (recommended over "plain")

### OIDC: Login page not loading
- Check that the interaction UID is valid (not expired)
- Verify the OIDC provider is mounted at `/oidc`

### JWT: Token expired
- JWT tokens are stateless; you'll need to re-login when they expire
- Consider implementing a refresh mechanism in your client

## Logout

### JWT Logout (Client-Side Only)
For JWT authentication, no server-side logout is needed:
```bash
await client.logout();
# Only clears localStorage, no redirect needed
```

### OIDC Logout (Server-Side)
For OIDC authentication, redirect to the `/end_session` endpoint:
```bash
GET /oidc/end_session?
  post_logout_redirect_uri=http://localhost:8080/&
  id_token_hint=eyJhbGci...
```

**Parameters:**
- `post_logout_redirect_uri`: Where to redirect after logout (must be in client's `post_logout_redirect_uris`)
- `id_token_hint`: Optional ID token (for logout confirmation)

**Response:**
- On success: Redirect to `post_logout_redirect_uri`
- On error: Redirect to `post_logout_redirect_uri?error=...`

**Example (JavaScript):**
```javascript
// Get OIDC config
const config = await fetch('/api/oidc-client-config').then(r => r.json());

// Get current ID token (from storage)
const idToken = localStorage.getItem('id_token');

// Redirect to logout
const logoutUrl = `${config.issuer}/end_session?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`;
if (idToken) {
    logoutUrl += `&id_token_hint=${idToken}`;
}
window.location.href = logoutUrl;
```

### CORS errors
- Ensure your DocPouch server allows your app's origin in `ALLOWED_ORIGINS`
