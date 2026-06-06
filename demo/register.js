// One-time helper to register this demo RP with DocPouch.
//
// Run with:
//   OIDC_REGISTRATION_TOKEN=... node register.js
//
// The registration token comes from the DocPouch server's
// OIDC_REGISTRATION_TOKEN environment variable (ask your admin).
//
// After running this once, DocPouch returns a client_id and
// client_secret. Copy them into the OIDC_CONFIG block in
// server.js (or load them from environment variables).

import DbPouchClient from 'docpouch-client';

const DOCPOUCH_HOST = 'http://localhost';
const DOCPOUCH_PORT = 3030;
const RP_PORT = 8080;

const registrationToken = process.env.OIDC_REGISTRATION_TOKEN;
if (!registrationToken) {
    console.error('Please set OIDC_REGISTRATION_TOKEN in the environment.');
    process.exit(1);
}

const client = new DbPouchClient(DOCPOUCH_HOST, DOCPOUCH_PORT);

const registration = {
    client_name: 'DocPouch OIDC RP demo',
    redirect_uris: [`http://localhost:${RP_PORT}/callback`],
    post_logout_redirect_uris: [`http://localhost:${RP_PORT}/`],
    response_types: ['code'],
    grant_types: ['authorization_code'],
    token_endpoint_auth_method: 'client_secret_basic',
    application_type: 'web',
};

const registered = await client.registerOidcClient(registration, registrationToken);

console.log('Registered OIDC client. Save these values:');
console.log(JSON.stringify(registered, null, 2));
console.log('\nNext steps:');
console.log(` - Set client_id in docs/demo/server.js (OIDC_CONFIG.clientId)`);
console.log(` - If you received a client_secret, set it in OIDC_CONFIG.clientSecret`);
console.log(` - Add http://localhost:${RP_PORT}/ to your DocPouch ALLOWED_ORIGINS`);
