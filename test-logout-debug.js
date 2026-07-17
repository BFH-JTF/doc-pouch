// Test script to debug OIDC logout flow
const http = require('http');
const https = require('https');
const url = require('url');

// Configuration
const baseUrl = 'http://localhost:3030';
const clientId = 'YOUR_CLIENT_ID'; // Replace with actual client ID
const clientSecret = 'YOUR_CLIENT_SECRET'; // Replace with actual client secret if needed

async function testLogoutFlow() {
    console.log('=== Testing OIDC Logout Flow ===');

    try {
        // Step 1: Check if server is running
        console.log('1. Checking if server is running...');
        const serverResponse = await makeRequest(`${baseUrl}/.well-known/openid-configuration`);
        console.log('   Server is running. OIDC configuration:', JSON.parse(serverResponse).issuer);

        // Step 2: Test logout endpoint directly
        console.log('2. Testing end_session endpoint...');
        const logoutUrl = `${baseUrl}/oidc/end_session?post_logout_redirect_uri=${encodeURIComponent(baseUrl + '/')}`;
        console.log('   Logout URL:', logoutUrl);

        // This would normally be called with an id_token_hint, but we're just testing the endpoint
        console.log('   Note: Actual logout requires valid id_token_hint parameter');

        console.log('\n=== How to Test Logout Cancellation ===');
        console.log('1. Start the DocPouch server with LOG_LEVEL=debug');
        console.log('2. Register a test client with post_logout_redirect_uris');
        console.log('3. Authenticate with the client to get an ID token');
        console.log('4. Navigate to the logout URL with id_token_hint parameter');
        console.log('5. Click "No, stay signed in" on the confirmation page');
        console.log('6. Check server logs for debug output');
        console.log('7. Verify you are redirected back without being logged out');

        console.log('\n=== Expected Debug Output ===');
        console.log('- "=== OIDC Request ===" with logout endpoint details');
        console.log('- "=== Logout Source Called ===" when logout page is shown');
        console.log('- "=== Interaction POST Request ===" when form is submitted');
        console.log('- "Handling logout prompt" and "User cancelled logout" messages');
        console.log('- "Redirecting user to:" with the correct redirect URI');

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

function makeRequest(urlString) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(urlString);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.end();
    });
}

// Run the test
testLogoutFlow();