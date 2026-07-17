const http = require('http');

const postData = JSON.stringify({
    client_name: 'Test ToolManager',
    redirect_uris: ['http://localhost:5173/callback'],
    post_logout_redirect_uris: ['http://localhost:5173/logout-callback']
});

const options = {
    hostname: 'localhost',
    port: 3030,
    path: '/api/oidc-client-register',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();