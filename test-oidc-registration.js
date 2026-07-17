import fetch from 'node-fetch';

async function testOidcRegistration() {
    try {
        // Test the new dynamic client registration endpoint
        const response = await fetch('http://localhost:3030/api/oidc-client-register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_name: 'Test ToolManager',
                redirect_uris: ['http://localhost:5173/callback'],
                post_logout_redirect_uris: ['http://localhost:5173/logout-callback']
            })
        });

        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log('✅ Dynamic client registration successful!');
            console.log('Client ID:', data.client_id);
            console.log('Post-logout redirect URIs:', data.post_logout_redirect_uris);
        } else {
            console.log('❌ Dynamic client registration failed:', data.error);
        }
    } catch (error) {
        console.error('Error testing OIDC registration:', error.message);
    }
}

// Run the test
testOidcRegistration();