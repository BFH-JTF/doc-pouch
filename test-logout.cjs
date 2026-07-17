// Simple test script to verify logout functionality
const http = require('http');

// Test the logout endpoint directly
const options = {
    hostname: 'localhost',
    port: 3030,
    path: '/oidc/end_session',
    method: 'GET'
};

console.log('Testing logout endpoint...');

const req = http.request(options, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);

    // Handle redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log('Redirecting to:', res.headers.location);
    }

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('Response body length:', data.length);
        if (data.length < 1000) {
            console.log('Body:', data);
        } else {
            console.log('Body (truncated):', data.substring(0, 1000) + '...');
        }
        console.log('Request completed');
    });
});

req.on('error', (e) => {
    console.error('Request error:', e.message);
});

req.end();