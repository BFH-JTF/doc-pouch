// ---------------------------------------------------------------------------
// useDocPouch — Reactive composable wrapping docpouch-client
//
// This is the heart of the template.  It demonstrates every major
// docpouch-client capability in one place, with Vue reactivity,
// error handling, and real-time sync.
//
// Copy this file into your own project and adapt the business-logic
// helpers (`loadDocuments`, `saveDocument`, etc.) to your domain.
// ---------------------------------------------------------------------------

import {ref, computed} from 'vue';
import DocPouchClient, {
    type I_DocumentEntry,
    type I_DataStructure,
    type I_UserEntry,
    type I_UserCreation,
    type I_UserUpdate,
    type I_LoginResponse,
} from 'docpouch-client';
import type {
    DocumentEntry,
    DocumentCreation,
    DataStructure,
    UserEntry,
    UserCreation,
    UserUpdate,
    ServerSettings,
    ServerClientConfig,
    LogoutOptions,
} from '../types';

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

const docPouchUrl = ref(localStorage.getItem('docpouch_url') || '');
const docPouchPort = ref(localStorage.getItem('docpouch_port') || '');
const isConfigured = computed(() => !!(docPouchUrl.value && docPouchPort.value));

const isAuthenticated = ref(false);
const authMethod = ref<'none' | 'jwt' | 'oidc'>('none');
const authError = ref('');
const loading = ref(false);
const isAdmin = ref(false);
const userName = ref('');

const documents = ref<DocumentEntry[]>([]);
const structures = ref<DataStructure[]>([]);
const users = ref<UserEntry[]>([]);
const realtimeEnabled = ref(false);

// Admin-only WebSocket warning. The server emits `databaseInconsistency`
// on connect when faulty documents (invalid owner / type / subType) are
// detected. Surfaced to the UI as a non-blocking banner.
const dbWarning = ref('');

// Whether to use the server-provided config or the localStorage override
const useServerConfig = ref(true);

let client: DocPouchClient | null = null;
let callbacksRegistered = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeBaseUrl(url: string, port: string): string {
    let base = url.trim();
    if (!base) return '';
    if (!base.match(/^https?:\/\//i)) {
        base = 'http://' + base;
    }
    base = base.replace(/\/+$/, '');
    const portNum = parseInt(port.trim(), 10);
    if (!isNaN(portNum) && portNum > 0 && !/:\d+(?=\/|$)/.test(base)) {
        base += ':' + portNum;
    }
    return base;
}

function is401Error(err: unknown): boolean {
    if (err instanceof Error) {
        const m = err.message.toLowerCase();
        return m.includes('401') || m.includes('unauthorized');
    }
    if (typeof err === 'object' && err !== null) {
        if ('status' in err && (err as any).status === 401) return true;
        if ('message' in err && typeof (err as any).message === 'string') {
            const m = (err as any).message.toLowerCase();
            return m.includes('401') || m.includes('unauthorized');
        }
    }
    return false;
}

function is403Error(err: unknown): boolean {
    if (err instanceof Error) {
        const m = err.message.toLowerCase();
        return m.includes('403') || m.includes('forbidden');
    }
    if (typeof err === 'object' && err !== null) {
        if ('status' in err && (err as any).status === 403) return true;
        if ('message' in err && typeof (err as any).message === 'string') {
            const m = (err as any).message.toLowerCase();
            return m.includes('403') || m.includes('forbidden');
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Server-driven configuration
// ---------------------------------------------------------------------------

/**
 * Fetch the OIDC/client configuration from the RP's own backend
 * (/api/oidc-client-config). Uses the client library's
 * fetchOidcClientConfig() when available, falls back to a raw fetch
 * when the client hasn't been initialized yet.
 *
 * Returns null if the endpoint is unreachable or reports `configured: false`.
 */
async function fetchServerConfig(): Promise<ServerClientConfig | null> {
    // Always fetch from the demo's own backend endpoint — this works
    // even before the client library is instantiated, and avoids
    // coupling the demo's config discovery to the library's
    // server-side discovery (which would point at the DocPouch
    // server's own /api/oidc-client-config, not the demo RP's).
    try {
        const resp = await fetch('/api/oidc-client-config');
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.configured === false || !data.issuer) return null;
        return {
            configured: data.configured ?? true,
            issuer: data.issuer,
            apiBaseUrl: data.apiBaseUrl,
            redirectUri: data.redirectUri,
            postLogoutRedirectUri: data.postLogoutRedirectUri,
            scopes: data.scope ? data.scope.split(' ') : data.scopes,
        };
    } catch {
        return null;
    }
}

/**
 * Resolve which DocPouch base URL to use.
 *
 * Strategy:
 *  1. If useServerConfig is true and /api/oidc-client-config returns a
 *     valid `apiBaseUrl`, use that (server-driven).
 *  2. Otherwise fall back to the user-entered localStorage URL/port
 *     (offline / direct-file-open / override mode).
 */
async function resolveBaseUrl(): Promise<{ baseUrl: string, serverConfig: ServerClientConfig | null }> {
    if (useServerConfig.value) {
        const serverConfig = await fetchServerConfig();
        if (serverConfig?.apiBaseUrl) {
            return {baseUrl: serverConfig.apiBaseUrl.replace(/\/+$/, ''), serverConfig};
        }
    }
    const baseUrl = normalizeBaseUrl(docPouchUrl.value, docPouchPort.value);
    return {baseUrl, serverConfig: null};
}

// ---------------------------------------------------------------------------
// Init / configuration (localStorage settings for fallback/override)
// ---------------------------------------------------------------------------

export function loadSettings(): ServerSettings {
    return {
        url: docPouchUrl.value,
        port: docPouchPort.value,
        registrationToken: localStorage.getItem('docpouch_registration_token') || '',
    };
}

export function saveSettings(settings: ServerSettings) {
    docPouchUrl.value = settings.url;
    docPouchPort.value = settings.port;
    localStorage.setItem('docpouch_url', settings.url);
    localStorage.setItem('docpouch_port', settings.port);
    if (settings.registrationToken) {
        localStorage.setItem('docpouch_registration_token', settings.registrationToken);
    }
}

export function clearSettings() {
    docPouchUrl.value = '';
    docPouchPort.value = '';
    localStorage.removeItem('docpouch_url');
    localStorage.removeItem('docpouch_port');
    localStorage.removeItem('docpouch_registration_token');
    if (client) {
        client.clearPersistedAuthState();
    } else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authMethod');
        localStorage.removeItem('docpouch_oidc_client_id');
        localStorage.removeItem('docpouch_oidc_session');
    }
}

// ---------------------------------------------------------------------------
// OIDC client registration (dynamic registration pattern)
// Uses the client library's ensureOidcClient() method which handles
// localStorage caching of the client ID, update-vs-register logic, etc.
// ---------------------------------------------------------------------------

async function ensureOidcClient(
    baseUrl: string,
    redirectUri: string,
    registrationToken: string
): Promise<string> {
    if (!client) throw new Error('Client not initialized');
    const postLogoutProxy = `${baseUrl}/oidc/logout-redirect?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
    return await client.ensureOidcClient(redirectUri, registrationToken, {
        clientName: 'DocPouch RP Template',
        postLogoutRedirectUri: postLogoutProxy,
    });
}

// ---------------------------------------------------------------------------
// Lifecycle callbacks (registered once per client instance)
// ---------------------------------------------------------------------------

function registerCallbacks() {
    if (!client || callbacksRegistered) return;
    callbacksRegistered = true;

    client.onLogout(() => {
        isAuthenticated.value = false;
        authMethod.value = 'none';
        realtimeEnabled.value = false;
        isAdmin.value = false;
        userName.value = '';
        documents.value = [];
        structures.value = [];
        users.value = [];
    });

    client.onOidcLogout(() => {
        isAuthenticated.value = false;
        authMethod.value = 'none';
        realtimeEnabled.value = false;
        documents.value = [];
        structures.value = [];
        users.value = [];
    });

    // Companion callback for JWT logout. `onLogout` above already covers
    // both methods, but registering `onJwtLogout` explicitly future-proofs
    // the template against any divergent JWT-only behaviour the library
    // may add (e.g. a distinct pre-clear hook).
    client.onJwtLogout(() => {
        isAuthenticated.value = false;
        authMethod.value = 'none';
        realtimeEnabled.value = false;
        isAdmin.value = false;
        userName.value = '';
        documents.value = [];
        structures.value = [];
        users.value = [];
    });
}

// ---------------------------------------------------------------------------
// Core init
// ---------------------------------------------------------------------------

export async function initService(): Promise<boolean> {
    if (!isConfigured.value && useServerConfig.value) {
        // Try server config even if localStorage isn't set
    } else if (!isConfigured.value) {
        return false;
    }

    const {baseUrl, serverConfig} = await resolveBaseUrl();
    if (!baseUrl) return false;

    // Build client with port baked into URL to work around library quirks
    client = new DocPouchClient(baseUrl, 0, handleSocketEvent);
    registerCallbacks();

    // If server config provided OIDC settings, set them on the client
    if (serverConfig) {
        client.setOidcConfig({
            issuer: serverConfig.issuer || client.getOidcIssuer(),
            clientId: serverConfig.clientId || '',
            redirectUri: serverConfig.redirectUri || window.location.origin + window.location.pathname,
            postLogoutRedirectUri: serverConfig.postLogoutRedirectUri,
            scope: serverConfig.scopes?.join(' ') || 'openid profile email offline_access',
        });
    }

    // initAuth() handles every restore path: OIDC logout redirect,
    // OIDC callback (code+state), persisted OIDC session, and the
    // JWT token stored under localStorage `authToken`. It returns
    // isAdmin/userName as empty stubs, so we fetch the real profile
    // via getCurrentUser() afterwards.
    const authState = await client.initAuth();
    if (authState.method !== 'none' && authState.token) {
        isAuthenticated.value = true;
        authMethod.value = authState.method;
        realtimeEnabled.value = true;
        client.setRealTimeSync(true);
        // Fetch the real profile (isAdmin, userName) from /users/whoami.
        // Works for both JWT and OIDC. If it fails (e.g. token already
        // expired) we keep the defaults and let the first API call
        // trigger a 401 → re-login.
        try {
            const me = await client.getCurrentUser();
            if (me) {
                isAdmin.value = !!me.isAdmin;
                userName.value = me.name || '';
            }
        } catch {
            // non-fatal — loadData() will surface auth errors
        }
        await loadData();
        return true;
    }

    isAuthenticated.value = false;
    authMethod.value = 'none';
    return false;
}

// ---------------------------------------------------------------------------
// JWT Login
// ---------------------------------------------------------------------------

export async function loginWithJwt(name: string, password: string): Promise<void> {
    if (!client) {
        // Build client on demand if initService hasn't run yet
        const {baseUrl} = await resolveBaseUrl();
        if (!baseUrl) throw new Error('DocPouch server URL not configured');
        client = new DocPouchClient(baseUrl, 0, handleSocketEvent);
        registerCallbacks();
    }

    authError.value = '';
    try {
        const response: I_LoginResponse | null = await client.login({name, password});
        if (!response || !response.token) {
            throw new Error('Login failed: no token returned');
        }

        // Persist JWT token under the library's own key (`authToken`) so
        // initAuth() can restore the session on page reload. Also persist
        // the auth method so the library knows to look for a JWT token.
        localStorage.setItem('authToken', response.token);
        client.persistAuthMethod('jwt');

        isAuthenticated.value = true;
        authMethod.value = 'jwt';
        isAdmin.value = response.isAdmin || false;
        userName.value = response.userName || name;
        realtimeEnabled.value = true;
        client.setRealTimeSync(true);
        await loadData();
    } catch (err: any) {
        authError.value = err.message || 'JWT login failed';
        throw err;
    }
}

// ---------------------------------------------------------------------------
// OIDC Login
// ---------------------------------------------------------------------------

export async function loginWithOidc(registrationToken: string): Promise<void> {
    if (!client) throw new Error('Client not initialized');
    authError.value = '';

    try {
        const {baseUrl} = await resolveBaseUrl();
        const redirectUri = window.location.origin + window.location.pathname;
        const clientId = await ensureOidcClient(baseUrl, redirectUri, registrationToken);
        const issuer = client.getOidcIssuer();
        const postLogoutProxy = `${baseUrl}/oidc/logout-redirect?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
        const config = {
            issuer,
            clientId,
            redirectUri,
            postLogoutRedirectUri: postLogoutProxy,
            scope: 'openid profile email offline_access',
        };
        client.setOidcConfig(config);
        await client.loginWithOidc(config);
    } catch (err: any) {
        authError.value = err.message || 'OIDC login failed';
        throw err;
    }
}

// ---------------------------------------------------------------------------
// OIDC Callback handling
// ---------------------------------------------------------------------------

export async function handleOidcCallback(): Promise<boolean> {
    if (!client) return false;

    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('code') || !urlParams.has('state')) return false;

    try {
        // The library reads the OIDC config it persisted in sessionStorage
        // during loginWithOidc(), so we no longer need to rebuild it here.
        const handled = await client.handleOidcCallback();
        if (handled && client.isAuthenticated()) {
            isAuthenticated.value = true;
            authMethod.value = client.getAuthMethod();
            realtimeEnabled.value = true;
            client.setRealTimeSync(true);
            try {
                const me = await client.getCurrentUser();
                if (me) {
                    isAdmin.value = !!me.isAdmin;
                    userName.value = me.name || '';
                }
            } catch {
                // non-fatal — loadData() will surface auth errors
            }
            await loadData();
            return true;
        }
    } catch (err: any) {
        authError.value = err.message || 'OIDC callback failed';
    }
    return false;
}

// ---------------------------------------------------------------------------
// Data operations — Documents
// ---------------------------------------------------------------------------

export async function loadData(): Promise<void> {
    if (!client || !isAuthenticated.value) return;
    loading.value = true;
    try {
        const docs = await client.fetchDocuments({type: 0, subType: 0});
        documents.value = docs.map((d: I_DocumentEntry) => ({
            ...d,
            id: d._id,
        })) as DocumentEntry[];
        structures.value = (await client.getStructures()) as DataStructure[];
        if (isAdmin.value) {
            await loadUsers();
        }
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return;
        }
        console.error('Failed to load data:', err);
        authError.value = err.message || 'Failed to load data';
    } finally {
        loading.value = false;
    }
}

export async function loadAllDocuments(): Promise<void> {
    if (!client || !isAuthenticated.value) return;
    loading.value = true;
    try {
        const docs = await client.listDocuments();
        documents.value = docs.map((d: I_DocumentEntry) => ({
            ...d,
            id: d._id,
        })) as DocumentEntry[];
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return;
        }
        console.error('Failed to load all documents:', err);
        authError.value = err.message || 'Failed to load documents';
    } finally {
        loading.value = false;
    }
}

export async function createDocument(doc: DocumentCreation): Promise<DocumentEntry | null> {
    if (!client) return null;
    try {
        const created = await client.createDocument(doc as I_DocumentEntry);
        await loadData();
        return created as DocumentEntry;
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return null;
        }
        throw err;
    }
}

export async function updateDocument(id: string, doc: Partial<DocumentEntry>): Promise<void> {
    if (!client) return;
    try {
        await client.updateDocument(id, doc as I_DocumentEntry);
        await loadData();
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return;
        }
        throw err;
    }
}

export async function removeDocument(id: string): Promise<void> {
    if (!client) return;
    try {
        await client.removeDocument(id);
        await loadData();
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return;
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Data operations — Structures
// ---------------------------------------------------------------------------

export async function createStructure(structure: DataStructure): Promise<DataStructure | null> {
    if (!client) return null;
    try {
        const created = await client.createStructure(structure);
        await loadData();
        return created as DataStructure;
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return null;
        }
        throw err;
    }
}

export async function updateStructure(id: string, structure: Partial<DataStructure>): Promise<void> {
    if (!client) return;
    try {
        await client.updateStructure(id, structure as I_DataStructure);
        await loadData();
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return;
        }
        throw err;
    }
}

export async function removeStructure(id: string): Promise<void> {
    if (!client) return;
    try {
        await client.removeStructure(id);
        await loadData();
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return;
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Data operations — Users (admin only)
// ---------------------------------------------------------------------------

async function loadUsers(): Promise<void> {
    if (!client || !isAdmin.value) return;
    try {
        users.value = (await client.listUsers()) as UserEntry[];
    } catch (err: any) {
        if (is401Error(err) || is403Error(err)) {
            // Not authorized to list users — hide the admin card
            isAdmin.value = false;
            return;
        }
        console.error('Failed to load users:', err);
    }
}

export async function createUser(user: UserCreation): Promise<UserEntry | null> {
    if (!client) return null;
    try {
        const created = await client.createUser(user as I_UserCreation);
        await loadUsers();
        return created as unknown as UserEntry;
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return null;
        }
        throw err;
    }
}

export async function updateUser(id: string, user: UserUpdate): Promise<void> {
    if (!client) return;
    try {
        await client.updateUser(id, user as I_UserUpdate);
        await loadUsers();
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return;
        }
        throw err;
    }
}

export async function removeUser(id: string): Promise<void> {
    if (!client) return;
    try {
        await client.removeUser(id);
        await loadUsers();
    } catch (err: any) {
        if (is401Error(err)) {
            handle401();
            return;
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Real-time sync
// ---------------------------------------------------------------------------

function handleSocketEvent(event: string, data: any) {
    console.log(`[WebSocket] ${event}:`, data);
    // Admin-only: server reports faulty documents found during the
    // connection-time consistency check. Surface as a non-blocking
    // warning rather than refreshing data.
    if (event === 'databaseInconsistency') {
        const faulty = Array.isArray(data?.faultyDocuments) ? data.faultyDocuments : [];
        dbWarning.value = faulty.length
            ? `Database inconsistency detected: ${faulty.length} faulty document(s). Review the admin UI.`
            : 'Database inconsistency detected.';
        return;
    }
    // Minimal live-update: refresh list on any document/structure/user
    // change. The server emits `newDocument`, `newStructure`, `newUser`,
    // `changedDocument`, `changedStructure`, `changedUser`,
    // `removedDocument`, `removedStructure`, `removedUser`. Note that
    // `removedID` is a *payload field* (the id of the removed entity),
    // not an event name.
    if (
        event.startsWith('new') ||
        event.startsWith('changed') ||
        event.startsWith('removed')
    ) {
        loadData();
    }
}

export function toggleRealtime(enabled: boolean) {
    realtimeEnabled.value = enabled;
    if (client) {
        client.setRealTimeSync(enabled);
    }
}

// ---------------------------------------------------------------------------
// Auth utilities
// ---------------------------------------------------------------------------

function handle401() {
    isAuthenticated.value = false;
    authMethod.value = 'none';
    authError.value = 'Session expired. Please log in again.';
    isAdmin.value = false;
    userName.value = '';
    if (client) {
        client.clearAuth();
        client.setRealTimeSync(false);
    }
}

export function clearAuthError() {
    authError.value = '';
}

export function setUseServerConfig(enabled: boolean) {
    useServerConfig.value = enabled;
}

export function clearDbWarning() {
    dbWarning.value = '';
}

export async function logout(options?: LogoutOptions): Promise<void> {
    if (!client) return;

    try {
        // logout() auto-detects OIDC vs JWT and does the right thing:
        //  - OIDC: redirects to /end_session (browser leaves the page)
        //  - JWT: clears local state and disconnects WebSocket
        //
        // For OIDC, optional `options` ({redirectUri?, idTokenHint?})
        // override the registered `post_logout_redirect_uri` / id token.
        // Omitted → library uses the values configured via setOidcConfig.
        await client.logout(options);

        // For JWT logout (no redirect), clear local reactive state + storage.
        // clearPersistedAuthState() removes the library-managed keys
        // (authToken, authMethod, docpouch_oidc_*).
        if (authMethod.value === 'jwt') {
            client.clearPersistedAuthState();
        }
        isAuthenticated.value = false;
        authMethod.value = 'none';
        realtimeEnabled.value = false;
        isAdmin.value = false;
        userName.value = '';
        documents.value = [];
        structures.value = [];
        users.value = [];
    } catch (err) {
        console.warn('Logout failed, clearing local state:', err);
        if (client) client.clearAuth();
        isAuthenticated.value = false;
        authMethod.value = 'none';
        realtimeEnabled.value = false;
        isAdmin.value = false;
        userName.value = '';
        documents.value = [];
        structures.value = [];
        users.value = [];
    }
}

// ---------------------------------------------------------------------------
// Exposed reactive refs
// ---------------------------------------------------------------------------

export {
    isConfigured,
    isAuthenticated,
    authMethod,
    authError,
    loading,
    isAdmin,
    userName,
    documents,
    structures,
    users,
    realtimeEnabled,
    useServerConfig,
    dbWarning,
};