// Test the standard OIDC dynamic client registration endpoint
import fetch from 'node-fetch';

async function testStandardOidcRegistration() {
    try {
        console.log('Testing standard OIDC dynamic client registration...');

        // First, get the registration endpoint from the discovery document
        const discoveryResponse = await fetch('http://localhost:3030/oidc/.well-known/openid-configuration');
        const discovery = await discoveryResponse.json();
        console.log('Discovery document:', discovery);

        const registrationEndpoint = discovery.registration_endpoint;
        console.log('Registration endpoint:', registrationEndpoint);

        if (!registrationEndpoint) {
            console.log('❌ No registration endpoint found in discovery document');
            return;
        }

        // Test registration with post_logout_redirect_uris
        const clientMetadata = {
            client_name: 'Test Client',
            redirect_uris: ['http://localhost:5173/callback'],
            post_logout_redirect_uris: ['http://localhost:5173/logout-callback'],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            application_type: 'web'
        };

        const response = await fetch(registrationEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer TestToken' // Use the registration token from .env
            },
            body: JSON.stringify(clientMetadata)
        });

        console.log('Registration response status:', response.status);
        const data = await response.json();
        console.log('Registration response:', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('✅ Standard OIDC dynamic registration successful!');
            console.log('Client ID:', data.client_id);
        } else {
            console.log('❌ Standard OIDC dynamic registration failed:', data.error || data.message);
        }
    } catch (error) {
        console.error('Error testing standard OIDC registration:', error.message);
    }
}

// Run the test
testStandardOidcRegistration();