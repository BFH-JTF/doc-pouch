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
    type I_DocumentQuery,
} from 'docpouch-client';
import type {DocumentEntry, DataStructure, ServerSettings, OidcClientConfig} from '../types';

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

const docPouchUrl = ref(localStorage.getItem('docpouch_url') || '');
const docPouchPort = ref(localStorage.getItem('docpouch_port') || '');
const isConfigured = computed(() => docPouchUrl.value && docPouchPort.value);

const isAuthenticated = ref(false);
const authMethod = ref<'none' | 'jwt' | 'oidc'>('none');
const authError = ref('');
const loading = ref(false);

const documents = ref<DocumentEntry[]>([]);
const structures = ref<DataStructure[]>([]);
const realtimeEnabled = ref(false);

let client: DocPouchClient | null = null;

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

function getOidcIssuer(baseUrl: string): string {
    return `${baseUrl}/oidc`;
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

// ---------------------------------------------------------------------------
// Init / configuration
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
    localStorage.removeItem('docpouch_oidc_client_id');
    localStorage.removeItem('docpouch_oidc_session');
}

// ---------------------------------------------------------------------------
// OIDC client registration (dynamic registration pattern)
// ---------------------------------------------------------------------------

async function ensureOidcClient(
    baseUrl: string,
    redirectUri: string,
    registrationToken: string
): Promise<string> {
    if (!client) throw new Error('Client not initialized');

    const storedClientId = localStorage.getItem('docpouch_oidc_client_id');
    const postLogoutProxy = `${baseUrl}/oidc/logout-redirect?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;

    const payload = {
        client_name: 'DocPouch RP Template',
        redirect_uris: [redirectUri],
        post_logout_redirect_uris: [redirectUri, postLogoutProxy],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none' as const,
        application_type: 'web' as const,
    };

    if (storedClientId) {
        try {
            await client.updateOidcClient(storedClientId, payload, registrationToken);
            return storedClientId;
        } catch (e) {
            console.log('Client update failed, will re-register:', e);
        }
    }

    const response = await client.registerOidcClient(payload, registrationToken);
    localStorage.setItem('docpouch_oidc_client_id', response.client_id);
    if (response.registration_access_token) {
        localStorage.setItem('docpouch_registration_token', response.registration_access_token);
    }
    return response.client_id;
}

// ---------------------------------------------------------------------------
// Core init
// ---------------------------------------------------------------------------

export async function initService(): Promise<boolean> {
    if (!isConfigured.value) return false;

    const baseUrl = normalizeBaseUrl(docPouchUrl.value, docPouchPort.value);
    if (!baseUrl) return false;

    // Build client with port baked into URL to work around library quirks
    client = new DocPouchClient(baseUrl, 0, handleSocketEvent);

    // Logout return detection
    if (client.wasJustLoggedOut()) {
        client.setToken(null);
        isAuthenticated.value = false;
        authMethod.value = 'none';
        return false;
    }

    // Restore existing OIDC session
    if (client.restoreOidcSession()) {
        const storedClientId = localStorage.getItem('docpouch_oidc_client_id');
        if (storedClientId) {
            const redirectUri = window.location.origin + window.location.pathname;
            const issuer = getOidcIssuer(baseUrl);
            const postLogoutProxy = `${baseUrl}/oidc/logout-redirect?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
            client.setOidcConfig({
                issuer,
                clientId: storedClientId,
                redirectUri,
                postLogoutRedirectUri: postLogoutProxy,
                scope: 'openid profile email offline_access',
            });
        }
        isAuthenticated.value = true;
        authMethod.value = client.getAuthMethod();
        realtimeEnabled.value = true;
        client.setRealTimeSync(true);
        await loadData();
        return true;
    }

    isAuthenticated.value = false;
    authMethod.value = 'none';
    return false;
}

// ---------------------------------------------------------------------------
// OIDC Login
// ---------------------------------------------------------------------------

export async function loginWithOidc(registrationToken: string): Promise<void> {
    if (!client) throw new Error('Client not initialized');
    authError.value = '';

    try {
        const baseUrl = normalizeBaseUrl(docPouchUrl.value, docPouchPort.value);
        const redirectUri = window.location.origin + window.location.pathname;
        const clientId = await ensureOidcClient(baseUrl, redirectUri, registrationToken);
        const issuer = getOidcIssuer(baseUrl);
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
        const baseUrl = normalizeBaseUrl(docPouchUrl.value, docPouchPort.value);
        const storedClientId = localStorage.getItem('docpouch_oidc_client_id');
        if (!storedClientId) return false;

        const redirectUri = window.location.origin + window.location.pathname;
        const issuer = getOidcIssuer(baseUrl);
        const postLogoutProxy = `${baseUrl}/oidc/logout-redirect?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
        client.setOidcConfig({
            issuer,
            clientId: storedClientId,
            redirectUri,
            postLogoutRedirectUri: postLogoutProxy,
            scope: 'openid profile email offline_access',
        });

        const handled = await client.handleOidcCallback();
        if (handled && client.isAuthenticated()) {
            isAuthenticated.value = true;
            authMethod.value = client.getAuthMethod();
            realtimeEnabled.value = true;
            client.setRealTimeSync(false);
            setTimeout(() => {
                if (client) client.setRealTimeSync(true);
            }, 100);
            await loadData();
            return true;
        }
    } catch (err: any) {
        authError.value = err.message || 'OIDC callback failed';
    }
    return false;
}

// ---------------------------------------------------------------------------
// Data operations
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

export async function createDocument(doc: Omit<DocumentEntry, '_id'>): Promise<DocumentEntry | null> {
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

// ---------------------------------------------------------------------------
// Real-time sync
// ---------------------------------------------------------------------------

function handleSocketEvent(event: string, data: any) {
    console.log(`[WebSocket] ${event}:`, data);
    // Minimal live-update: refresh list on any document/structure change
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
    if (client) {
        client.setToken(null);
        client.setRealTimeSync(false);
    }
}

export function clearAuthError() {
    authError.value = '';
}

export async function logout(): Promise<void> {
    if (!client) return;

    try {
        if (client.getAuthMethod() === 'oidc') {
            const baseUrl = normalizeBaseUrl(docPouchUrl.value, docPouchPort.value);
            const redirectUri = window.location.origin + window.location.pathname;
            const postLogoutProxy = `${baseUrl}/oidc/logout-redirect?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`;
            let url = `${getOidcIssuer(baseUrl)}/end_session?post_logout_redirect_uri=${encodeURIComponent(postLogoutProxy)}`;

            const sessionStr = localStorage.getItem('docpouch_oidc_session');
            if (sessionStr) {
                try {
                    const session = JSON.parse(sessionStr);
                    if (session.idToken) {
                        url += `&id_token_hint=${encodeURIComponent(session.idToken)}`;
                    }
                } catch {
                }
            }

            sessionStorage.setItem('docpouch_logout_in_progress', 'true');
            window.location.href = url;
            return;
        }

        await client.logout();
        isAuthenticated.value = false;
        authMethod.value = 'none';
        realtimeEnabled.value = false;
    } catch (err) {
        console.warn('Logout failed, clearing local state:', err);
        client.setToken(null);
        isAuthenticated.value = false;
        authMethod.value = 'none';
        realtimeEnabled.value = false;
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
    documents,
    structures,
    realtimeEnabled,
};
