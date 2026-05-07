#!/bin/bash
# Test script for DocPouch OIDC setup

echo "=========================================="
echo "DocPouch OIDC Authentication Test"
echo "=========================================="
echo ""

# Check if server is running
echo "Checking if DocPouch server is running..."
if curl -s --head http://localhost:3030 > /dev/null; then
    echo "✓ Server is running"
else
    echo "✗ Server is not running. Start with: npm run run"
    exit 1
fi

echo ""
echo "1. Testing OIDC Discovery Endpoint..."
DISCOVERY=$(curl -s http://localhost:3030/.well-known/openid-configuration)
if echo "$DISCOVERY" | grep -q "issuer"; then
    echo "✓ Discovery endpoint working"
    echo "$DISCOVERY" | head -20
else
    echo "✗ Discovery endpoint failed"
fi

echo ""
echo "2. Testing client registration (requires OIDC_REGISTRATION_TOKEN)..."
if [ -z "$OIDC_REGISTRATION_TOKEN" ]; then
    echo "⚠ OIDC_REGISTRATION_TOKEN not set. Skipping registration test."
    echo "  Set it with: export OIDC_REGISTRATION_TOKEN=your_token"
else
    REG_RESPONSE=$(curl -s -X POST http://localhost:3030/oidc/reg \
      -H "Authorization: Bearer $OIDC_REGISTRATION_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"client_name": "test-client", "redirect_uris": ["http://localhost:8080/cb"]}')
    
    if echo "$REG_RESPONSE" | grep -q "client_id"; then
        echo "✓ Client registration successful"
        echo "$REG_RESPONSE" | head -10
        CLIENT_ID=$(echo "$REG_RESPONSE" | grep -o '"client_id":"[^"]*"' | cut -d'"' -f4)
        echo "  Client ID: $CLIENT_ID"
    else
        echo "✗ Client registration failed"
        echo "$REG_RESPONSE"
    fi
fi

echo ""
echo "3. Testing JWKS endpoint..."
JWKS=$(curl -s http://localhost:3030/oidc/jwks)
if echo "$JWKS" | grep -q "keys"; then
    echo "✓ JWKS endpoint working"
else
    echo "✗ JWKS endpoint failed"
fi

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "To test the full OIDC flow manually:"
echo ""
echo "1. Register a client (if not done above)"
echo "2. Visit: http://localhost:3030/oidc/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:8080/cb&response_type=code&scope=openid"
echo "3. You should see the DocPouch login page"
echo "4. After login, you'll be redirected with an authorization code"
echo ""
echo "For JWT auth test:"
echo "curl -X POST http://localhost:3030/users/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"name\": \"admin\", \"password\": \"yourpassword\"}'"
