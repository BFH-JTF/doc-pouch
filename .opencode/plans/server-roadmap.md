# DocPouch OIDC Logout Implementation Plan

## Overview
This plan implements OIDC-compliant logout with automatic redirect to client home pages after logout. The implementation follows full OIDC standards including `/end_session`, `/revocation`, `/backchannel`, and `/pushed_authorization` endpoints.

## Requirements (Based on User Input)

1. ✅ **OIDC logout**: Server redirects to client home page after logout
2. ✅ **No success message**: Immediate redirect (no "logged out" page)
3. ✅ **Client-specific redirect**: Use `post_logout_redirect_uri` if provided
4. ✅ **Remove `/oidc/logout`**: JWT uses different logout path, only `/end_session` needed
5. ✅ **Full OIDC standards**: Enable `end_session`, `revocation`, `backchannel`, `pushed_authorization`
6. ✅ **OpenAPI schema**: Add `post_logout_redirect_uris` field
7. ✅ **Update documentation**: Reflect logout changes

## Files to Modify

### 1. NetworkManager.ts (Server - OIDC Configuration)

#### Change 1: Enable OIDC Features (Lines ~149-158)

**Current:**
```typescript
features: {
    devInteractions: {enabled: false},
    registration: {
        enabled: true,
        initialAccessToken: process.env.OIDC_REGISTRATION_TOKEN,
        issueRegistrationAccessToken: true,
        secretFactory: (ctx) => {
            return crypto.randomBytes(64).toString('base64url');
        }
    }
}
```

**After:**
```typescript
features: {
    devInteractions: {enabled: false},
    endSession: {enabled: true},              // NEW - Enable /end_session endpoint
    revocation: {enabled: true},              // NEW - Enable /revocation endpoint
    backchannel: {enabled: true},             // NEW - Enable backchannel logout
    pushedAuthorization: {enabled: true},     // NEW - Enable pushed auth requests
    registration: {
        enabled: true,
        initialAccessToken: process.env.OIDC_REGISTRATION_TOKEN,
        issueRegistrationAccessToken: true,
        secretFactory: (ctx) => {
            return crypto.randomBytes(64).toString('base64url');
        }
    }
}
```

#### Change 2: Update Client Registration (Lines ~274-282, 265-268)

**For new client creation (around line 274):**
```typescript
const client = new this.oidcProvider.Client({
    client_id: clientId,
    client_name: 'DocPouch Admin UI',
    redirect_uris: [redirectUri],
    post_logout_redirect_uris: [redirectUri],  // NEW - Post-logout redirect support
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
});
```

**For existing client updates (around line 265):**
```typescript
const existingUris = existing.redirect_uris || [];
const existingPostLogoutUris = existing.post_logout_redirect_uris || [];

if (!existingUris.includes(redirectUri)) {
    const updatedUris = [...existingUris, redirectUri];
    await clientAdapter.upsert(registeredClientId, {
        ...existing,
        redirect_uris: updatedUris,
        post_logout_redirect_uris: updatedUris,  // NEW
    }, existing.expiresAt);
    this.logger.info(`Updated OIDC client redirect URIs: ${JSON.stringify(updatedUris)}`);
}
```

#### Change 3: Update `/api/oidc-client-config` Response (Lines ~293-298)

**Current:**
```typescript
res.json({
    issuer: process.env.OIDC_ISSUER || `${protocol}://${host}/oidc`,
    clientId: registeredClientId,
    redirectUri,
    scope: 'openid profile email offline_access',
});
```

**After:**
```typescript
res.json({
    issuer: process.env.OIDC_ISSUER || `${protocol}://${host}/oidc`,
    clientId: registeredClientId,
    redirectUri,
    postLogoutRedirectUri: redirectUri,  // NEW
    scope: 'openid profile email offline_access',
});
```

#### Change 4: Remove `/oidc/logout` Endpoint (Lines ~305-341)

**Delete entire endpoint** (lines 305-341):
```typescript
// DELETE THIS ENTIRE BLOCK:
this.expressApp.get('/oidc/logout', async (req, res) => {
    // ... (37 lines of logout logic)
    res.status(200).json({message: 'Logged out'});
});
```

**Reason:** Replaced by OIDC-compliant `/end_session` endpoint.

---

### 2. App.vue (Client - Logout Handler)

#### Change: Update handleLogout Function (Lines ~478-500)

**Current:**
```typescript
async function handleLogout() {
    // Destroy OIDC server session to prevent auto-login on next OIDC attempt
    try {
        await fetch('/oidc/logout', {method: 'GET', credentials: 'include'});
    } catch (e) {
        console.error('Failed to destroy OIDC session:', e);
    }
    apiClient.logout();
    authToken.value = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('authMethod');
    // ... reset all UI state
    showLoginDialog.value = true;
    loggedInUsername.value = '';
}
```

**After (JWT clients only):**
```typescript
async function handleLogout() {
    // JWT logout: only client-side cleanup
    // OIDC logout handled by /end_session (no server call needed for JWT)
    apiClient.logout();
    authToken.value = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('authMethod');
    // ... reset all UI state
    showLoginDialog.value = true;
    loggedInUsername.value = '';
}
```

**For OIDC logout, clients must call `/end_session` directly:**
```typescript
// OIDC logout example (if needed in future)
const logoutUrl = `${config.issuer}/end_session?post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`;
window.location.href = logoutUrl;
```

---

### 3. docpouch_openAPI.yaml (Server - OpenAPI Schema)

#### Change: Add post_logout_redirect_uris to OidcClientRegistration (Lines ~1291-1294)

**Find `tos_uri` field (around line 1288-1291) and add new fields after it:**

```yaml
        tos_uri:
          type: string
          format: uri
          description: "URL of the client's terms of service"
        post_logout_redirect_uris:        # NEW
          type: array                        # NEW
          items:                             # NEW
            type: string                     # NEW
            format: uri                      # NEW
          description: "List of allowed post-logout redirect URIs"  # NEW
          example: ["http://localhost:8080/"]  # NEW
      required:
        - client_name
        - redirect_uris
```

---

### 4. README.md (Documentation)

#### Change: Update Logout Section (Lines ~349-356)

**Current:**
```markdown
**6. Logout:**

```ts
await client.logout();
// Clears tokens, disconnects WebSocket
// Also destroy server session:
await fetch('/oidc/logout', { credentials: 'include' });
```
```

**After:**
```markdown
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
```

---

### 5. docs/authentication.md (Documentation)

#### Change: Add Logout Section to OIDC Authentication Guide

**Find the logout section or add after "Step 3: Handle the Callback"**

```markdown
### Step 4: Logout

**For OIDC logout**, redirect to the end_session endpoint:

```
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

**For JWT logout**, no server-side logout is needed:
```javascript
await client.logout(); // Only clears localStorage
// No redirect needed, client controls UI flow
```

---

## Database Cleanup

Since existing clients are from previous tests, delete them before production:

```bash
# Stop server first
# Then delete client database
rm ./log/oidc-Client.db
rm ./db/oidc-Client.db

# Restart server to recreate with new settings
```

**Or** via API (once server is running with new code):
```bash
# Get client list
curl http://localhost:3030/.well-known/openid-configuration

# Delete specific clients via API (if available)
curl -X DELETE http://localhost:3030/oidc/reg/{clientId} \
  -H "Authorization: Bearer YOUR_REGISTRATION_TOKEN"
```

---

## Testing Checklist

### Server Changes
- [ ] Start server with new code
- [ ] Check console logs for feature enablement messages
- [ ] Verify `/end_session`, `/revocation`, `/backchannel`, `/pushed_authorization` endpoints are accessible
- [ ] Test `/api/oidc-client-config` returns `postLogoutRedirectUri`
- [ ] Register new OIDC client with `post_logout_redirect_uris`
- [ ] Verify client stores `post_logout_redirect_uris` in database
- [ ] Test logout via `/end_session` redirects to correct URI
- [ ] Test logout without `post_logout_redirect_uri` redirects to app root

### Client Changes
- [ ] Test JWT logout still works (no server call)
- [ ] Test OIDC logout via `/end_session` redirects correctly
- [ ] Verify login dialog appears after redirect
- [ ] Test multiple clients with different redirect URIs
- [ ] Verify no "logged out" success message shown

### Integration Testing
- [ ] OIDC login → logout → redirect → login dialog
- [ ] JWT login → logout → no server call → login dialog
- [ ] Dynamic client registration → logout with custom redirect_uri
- [ ] Check discovery document at `/.well-known/openid-configuration` shows all new endpoints

---

## Rollback Plan

If issues arise, revert these changes:

1. Revert NetworkManager.ts (remove features, revert client config changes, re-add `/oidc/logout`)
2. Revert App.vue (restore original logout handler)
3. Revert docpouch_openAPI.yaml (remove `post_logout_redirect_uris`)
4. Revert README.md and docs/authentication.md
5. Restart server

---

## Implementation Dependencies

- Node.js 18+ (oidc-provider compatibility)
- oidc-provider 9.8.3 (already installed)
- No additional dependencies needed

---

## Timeline Estimate

1. **Server changes (NetworkManager.ts)**: 2-3 hours
2. **Client changes (App.vue)**: 30 minutes
3. **OpenAPI schema (docpouch_openAPI.yaml)**: 20 minutes
4. **Documentation (README.md, docs)**: 1 hour
5. **Testing**: 2 hours
6. **Total**: ~6 hours

---

## Known Limitations

1. Dynamic clients must explicitly specify `post_logout_redirect_uris` during registration
2. No "logged out" confirmation page (users are redirected immediately)
3. JWT and OIDC have separate logout flows (intentional for cleaner architecture)

---

## Additional OIDC Endpoints to Enable

Based on user request for full standards compliance:

| Endpoint | Purpose | Enable? |
|----------|---------|---------|
| `/end_session` | Logout | ✅ Yes |
| `/revocation` | Token revocation | ✅ Yes |
| `/backchannel` | Backchannel logout | ✅ Yes |
| `/pushed_authorization` | PAR | ✅ Yes |
| `/introspection` | Token introspection | ⚠️ Optional |
| `/check_session_iframe` | Session monitoring | ⚠️ Optional |

---

## Notes

### Why Remove /oidc/logout?
1. Not OIDC-compliant
2. JWT logout doesn't need it (different auth method)
3. oidc-provider provides `/end_session` out of the box
4. Cleaner architecture with standards-based endpoints

### Why Enable Additional Endpoints?
- `/revocation`: Allows clients to revoke tokens (security best practice)
- `/backchannel`: Server-initiated client logout (for multi-client scenarios)
- `/pushed_authorization`: Pre-authorize requests (security enhancement)

### Backward Compatibility
- JWT clients: No impact (they don't use `/oidc/logout`)
- OIDC clients: Must update to use `/end_session` instead of `/oidc/logout`
- Dynamic clients: Need to update registration to include `post_logout_redirect_uris`
