// Test script to verify OIDC client registration setup
import {createRequire} from 'module';

const require = createRequire(import.meta.url);

// Load environment variables
import dotenv from 'dotenv';

dotenv.config();

async function testOidcSetup() {
    console.log('Testing OIDC Provider Setup...\n');

    // Check environment variables
    const registrationToken = process.env.OIDC_REGISTRATION_TOKEN;
    console.log('OIDC_REGISTRATION_TOKEN:', registrationToken ? '✓ Set' : '✗ Not set');

    const issuer = process.env.OIDC_ISSUER || 'http://localhost:3030';
    console.log('OIDC_ISSUER:', issuer);

    // Test crypto functions used in provider setup
    const crypto = await import('crypto');

    // Test JWKS generation
    try {
        const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {type: 'spki', format: 'pem'},
            privateKeyEncoding: {type: 'pkcs8', format: 'pem'}
        });
        console.log('✓ JWKS generation: Success');
    } catch (err) {
        console.log('✗ JWKS generation failed:', err);
    }

    // Test secret generation
    try {
        const secret = crypto.randomBytes(64).toString('base64url');
        console.log('✓ Client secret generation: Success (length:', secret.length, ')');
    } catch (err) {
        console.log('✗ Client secret generation failed:', err);
    }

    console.log('\nSetup verification complete!');
    console.log('\nTo test client registration, run:');
    console.log(`curl -X POST ${issuer}/oidc/reg \\`);
    console.log(`  -H "Authorization: Bearer ${registrationToken || 'YOUR_TOKEN'}" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -d '{"client_name": "test-client", "redirect_uris": ["http://localhost:8080/cb"]}'`);
}

testOidcSetup().catch(console.error);
