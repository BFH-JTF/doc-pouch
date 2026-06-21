// One-time helper to register this demo RP with DocPouch.
//
// Run with:
//   OIDC_REGISTRATION_TOKEN=... node register.js
//
// The registration token comes from the DocPouch server's
// OIDC_REGISTRATION_TOKEN environment variable (ask your admin).
//
// After running this once, DocPouch returns a client_id (and, depending
// on the configured auth method, a registration_access_token). Copy the
// client_id into localStorage via the Server Configuration modal, or
// store it server-side and inject it into your build.
//
// Environment variables (all optional — sensible localhost defaults):
//   OIDC_REGISTRATION_TOKEN  (required) initial access token for /oidc/reg
//   DOCPOUCH_HOST            default: http://localhost
//   DOCPOUCH_PORT            default: 3030
//   RP_PORT                  default: 8080  (the port this demo runs on)

import DocPouchClient from 'docpouch-client';

const DOCPOUCH_HOST = process.env.DOCPOUCH_HOST || 'http://localhost';
const DOCPOUCH_PORT = parseInt(process.env.DOCPOUCH_PORT || '3030', 10);
const RP_PORT = parseInt(process.env.RP_PORT || '8080', 10);

const registrationToken = process.env.OIDC_REGISTRATION_TOKEN;
if (!registrationToken) {
    console.error('Please set OIDC_REGISTRATION_TOKEN in the environment.');
    process.exit(1);
}

const client = new DocPouchClient(DOCPOUCH_HOST, DOCPOUCH_PORT);

const redirectUri = `http://localhost:${RP_PORT}/callback`;
const postLogoutUri = `http://localhost:${RP_PORT}/`;

const registration = {
    client_name: 'DocPouch OIDC RP demo',
    redirect_uris: [redirectUri],
    post_logout_redirect_uris: [postLogoutUri],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    // 'none' = public client using PKCE (no client_secret). This matches
    // the SPA flow used by the demo's useDocPouch composable.
    token_endpoint_auth_method: 'none',
    application_type: 'web',
};

const registered = await client.registerOidcClient(registration, registrationToken);

console.log('Registered OIDC client. Save these values:');
console.log(JSON.stringify(registered, null, 2));
console.log('\nNext steps:');
console.log(` - Use client_id "${registered.client_id}" in the demo's Server Configuration modal.`);
console.log(` - Add http://localhost:${RP_PORT}/ to your DocPouch ALLOWED_ORIGINS.`);