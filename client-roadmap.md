# DocPouch Client Library Update Plan

## Overview
This plan updates the docpouch-client library to support the new OIDC logout implementation in the server. The server will switch from custom `/oidc/logout` to standard OIDC `/end_session` endpoint.

## Current Client Behavior

### Logout Method (docpouch-client)
```typescript
await client.logout();
// Clears tokens, disconnects WebSocket
// For JWT: Only client-side cleanup
// For OIDC: Calls /oidc/logout to destroy server session
```

### Current Logout Flow
1. Client calls `client.logout()`
2. Library sends `GET /oidc/logout` with credentials
3. Server destroys OIDC session (if exists) and returns `{message: 'Logged out'}`
4. Client clears localStorage (tokens, authMethod, etc.)
5. Client shows login dialog

## Server Changes Requiring Client Update

### 1. Remove /oidc/logout Endpoint
- **Current**: `GET /oidc/logout` returns `{message: 'Logged out'}`
- **Removed**: No longer available after server upgrade
- **Impact**: Client calls will get 404 error

### 2. OIDC Logout Now Uses /end_session
- **New**: `GET /oidc/end_session?post_logout_redirect_uri=...`
- **Behavior**: Server destroys session and redirects to redirect_uri
- **No response body**: Redirect happens, no JSON response

### 3. New OIDC Features Enabled
- `/revocation`: Token revocation endpoint
- `/backchannel_logout`: Backchannel logout
- `/pushed_authorization`: Pushed auth requests (PAR)

## Required Client Updates

### 1. Update logout() Method Signature

**Current:**
```typescript
async logout(): Promise<void> {
    // Cleanup localStorage
    // Disconnect WebSocket
    // Clear tokens
}
```

**After:**
```typescript
async logout(options?: LogoutOptions): Promise<void> {
    const { authMethod } = this;
    
    if (authMethod === 'oidc') {
        // Redirect to /end_session
        const redirectUri = options?.redirectUri || window.location.origin;
        const issuer = this.config?.issuer || this.issuer;
        const url = `${issuer}/end_session?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
        // Optionally include id_token_hint if available
        const idToken = this.getIdToken();
        if (idToken) {
            url += `&id_token_hint=${idToken}`;
        }
        window.location.href = url;
        // Wait for redirect (don't continue cleanup yet)
        return;
    }
    
    if (authMethod === 'jwt') {
        // JWT: only client-side cleanup
        this.cleanup();
        return;
    }
    
    // No auth: just cleanup
    this.cleanup();
}

interface LogoutOptions {
    redirectUri?: string;     // Where to redirect after OIDC logout (default: app root)
    idTokenHint?: string;     // Optional ID token hint for logout confirmation
}
```

### 2. Add New logoutOidc() Method

```typescript
/**
 * Explicitly logout from OIDC provider
 * Redirects to /end_session endpoint
 */
async logoutOidc(options?: LogoutOptions): Promise<void> {
    if (this.authMethod !== 'oidc') {
        throw new Error('Not logged in with OIDC');
    }
    
    const { redirectUri = window.location.origin, idTokenHint } = options || {};
    
    if (!this.config?.issuer) {
        throw new Error('OIDC issuer not configured');
    }
    
    let url = `${this.config.issuer}/end_session?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    if (idTokenHint) {
        url += `&id_token_hint=${idTokenHint}`;
    } else if (this.idToken) {
        url += `&id_token_hint=${this.idToken}`;
    }
    
    window.location.href = url;
}

/**
 * Logout from JWT (client-side only)
 */
async logoutJwt(): Promise<void> {
    if (this.authMethod !== 'jwt') {
        throw new Error('Not logged in with JWT');
    }
    
    this.cleanup();
}
```

### 3. Add Event Emitter for Logout State

```typescript
class DbPouchClient {
    // ... existing properties ...
    
    events: {
        logout: () => void;
        'oidc-logout': () => void;
        'jwt-logout': () => void;
    };
    
    /**
     * Listen for logout events
     */
    onLogout(callback: () => void): void {
        this.events.logout = callback;
    }
    
    /**
     * Listen for OIDC logout specifically
     */
    onOidcLogout(callback: () => void): void {
        this.events['oidc-logout'] = callback;
    }
    
    /**
     * Listen for JWT logout specifically
     */
    onJwtLogout(callback: () => void): void {
        this.events['jwt-logout'] = callback;
    }
}
```

### 4. Detect Logout State on App Init

After redirect from `/end_session`, client should detect logout state:

```typescript
class DbPouchClient {
    /**
     * Check if user was just logged out (after redirect from /end_session)
     * Checks URL for logout indicator or checks localStorage
     */
    wasJustLoggedOut(): boolean {
        // Option 1: Check URL query parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('logout') === 'true') {
            return true;
        }
        
        // Option 2: Check localStorage flag
        const lastAuthMethod = localStorage.getItem('lastAuthMethod');
        const currentAuthMethod = localStorage.getItem('authMethod');
        
        // If last was OIDC/JWT but current is none, was logged out
        if (lastAuthMethod && currentAuthMethod === null) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Get redirecturi after OIDC logout (if redirectUri was set)
     */
    get PostLogoutRedirectUri(): string | null {
        return localStorage.getItem('postLogoutRedirectUri');
    }
}
```

### 5. Update restoreOidcSession() Behavior

```typescript
/**
 * Try to restore OIDC session from tokens
 * If no session, check if user was just logged out
 */
restoreOidcSession(): boolean {
    const restored = super.restoreOidcSession();
    
    if (!restored) {
        // If no session, check if user was just logged out
        if (this.wasJustLoggedOut()) {
            // User was logged out, show logout confirmation if needed
            // Or automatically show login dialog
            this.emit('oidc-logout');
        }
    }
    
    return restored;
}
```

### 6. Add New Config Properties

```typescript
interface OidcConfig {
    issuer: string;
    clientId: string;
    redirectUri: string;
    postLogoutRedirectUri?: string;  // NEW
    scope?: string;
    [key: string]: any;
}

class DbPouchClient {
    private postLogoutRedirectUri?: string;
    
    /**
     * Set OIDC config with post_logout_redirect_uri support
     */
    setOidcConfig(config: OidcConfig): void {
        super.setOidcConfig(config);
        
        if (config.postLogoutRedirectUri) {
            this.postLogoutRedirectUri = config.postLogoutRedirectUri;
        }
    }
    
    /**
     * Get post_logout_redirect_uri
     */
    getPostLogoutRedirectUri(): string | undefined {
        return this.postLogoutRedirectUri || this.config?.postLogoutRedirectUri;
    }
}
```

### 7. Handle Backchannel Logout (Optional)

For full OIDC compliance, implement backchannel logout:

```typescript
/**
 * Handle backchannel logout notification from server
 * This is called when server-initiated logout occurs
 */
async handleBackchannelLogout(sub: string, sid?: string): Promise<void> {
    // Verify the logout request (check signature if available)
    // Clear local session
    this.logout();
    
    // Notify user (optional)
    this.emit('backchannel-logout', { sub, sid });
}
```

### 8. Add Token Revocation Support

```typescript
/**
 * Revoke OIDC tokens
 * Call this before logout to invalidate tokens
 */
async revokeTokens(): Promise<void> {
    if (!this.accessToken) {
        return;
    }
    
    const issuer = this.config?.issuer;
    if (!issuer) {
        throw new Error('OIDC issuer not configured');
    }
    
    try {
        await fetch(`${issuer}/revocation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                token: this.accessToken,
                token_type_hint: 'access_token',
                client_id: this.config?.clientId || '',
            }),
        });
        
        // Also revoke refresh token if available
        if (this.refreshToken) {
            await fetch(`${issuer}/revocation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    token: this.refreshToken,
                    token_type_hint: 'refresh_token',
                    client_id: this.config?.clientId || '',
                }),
            });
        }
    } catch (error) {
        console.error('Token revocation failed:', error);
        // Continue with logout anyway
    }
}
```

## Updated Documentation for End Users

### JWT Logout (No Server Call)
```typescript
await client.logout();
// Just clears localStorage, no server call
// Client controls UI flow
```

### OIDC Logout (via /end_session)
```typescript
await client.logout();
// Redirects to /end_session, user sees logout confirmation
// Then redirected back to post_logout_redirect_uri
```

### Explicit OIDC Logout
```typescript
await client.logoutOidc({ redirectUri: 'https://my-app.com/login' });
// Redirects to /end_session with custom redirect_uri
```

### Check Logout State
```typescript
if (client.wasJustLoggedOut()) {
    // User was just logged out, show appropriate message
    showLogoutConfirmation();
}
```

### Listen for Logout Events
```typescript
client.onOidcLogout(() => {
    console.log('User logged out from OIDC');
    // Show logout toast, redirect, etc.
});
```

## Implementation Timeline

1. **Update logout() method**: 1-2 hours
2. **Add logoutOidc() and logoutJwt()**: 30 minutes
3. **Add logout state detection**: 1 hour
4. **Add event emitter**: 30 minutes
5. **Add token revocation**: 1 hour
6. **Update tests**: 2 hours
7. **Total**: ~8 hours

## Backward Compatibility

**Breaking Changes:**
- `logout()` behavior changes: For OIDC, it now redirects instead of just returning
- URL after OIDC logout will be `post_logout_redirect_uri` instead of app root

**Migration Path:**
1. Add new `logoutOidc()` and `logoutJwt()` methods
2. Keep old `logout()` for backward compatibility (with deprecation warning)
3. Eventually deprecate old `logout()` for OIDC

## Testing Checklist

### Client Library
- [ ] JWT logout clears localStorage only
- [ ] OIDC logout redirects to /end_session
- [ ] Redirect includes `post_logout_redirect_uri` parameter
- [ ] Redirect includes optional `id_token_hint`
- [ ] After redirect, client detects logout state
- [ ] Event emitter fires on logout
- [ ] Token revocation works
- [ ] Multiple logout scenarios work (direct, silent, error)

### Integration
- [ ] Client with old `logout()` still works (backward compat)
- [ ] Client with new methods works (OIDC, JWT, explicit)
- [ ] Logout state detection accurate
- [ ] Event listeners fire correctly
- [ ] Token revocation invalidates tokens

---

## Notes for Implementation

1. **Keep existing logout() for backward compatibility** - Add deprecation warning but don't break immediately
2. **Add logout state to localStorage** - Use `lastAuthMethod` flag to detect logout after redirect
3. **Handle errors gracefully** - If `/end_session` fails, still clear local tokens
4. **Test with multiple clients** - Ensure different redirect URIs work
5. **Document breaking changes** - Clearly communicate behavior changes

---

## Future Enhancements

1. **Session monitoring**: Implement check_session_iframe for session state awareness
2. **Popup logout**: Support logout via popup window for better UX
3. **Silent logout**: Support iframe-based logout for background cleanup
4. **Logout from all devices**: Add support for global logout (requires server-side session tracking)
5. **Logout confirmation**: Add optional logout confirmation UI after redirect
