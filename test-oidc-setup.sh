#!/bin/bash
# Test script to verify OIDC setup

echo "Testing OIDC Provider Setup..."
echo ""

# Check if .env file exists
if [ -f ".env" ]; then
    echo "✓ .env file exists"
    # Source env file
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "✗ .env file not found (copy .env.example to .env)"
fi

# Check environment variables
if [ -n "$OIDC_REGISTRATION_TOKEN" ]; then
    echo "✓ OIDC_REGISTRATION_TOKEN is set"
else
    echo "✗ OIDC_REGISTRATION_TOKEN is not set"
fi

if [ -n "$OIDC_ISSUER" ]; then
    echo "✓ OIDC_ISSUER: $OIDC_ISSUER"
else
    echo "✓ OIDC_ISSUER: using default (http://localhost:3030)"
fi

echo ""
echo "To test client registration manually:"
echo "--------------------------------"
echo "curl -X POST http://localhost:3030/oidc/reg \\"
echo "  -H \"Authorization: Bearer \$OIDC_REGISTRATION_TOKEN\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"client_name\": \"test-client\", \"redirect_uris\": [\"http://localhost:8080/cb\"]}'"
echo ""
echo "Or with the token directly:"
echo "curl -X POST http://localhost:3030/oidc/reg \\"
echo "  -H \"Authorization: Bearer ${OIDC_REGISTRATION_TOKEN:-YOUR_TOKEN}\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"client_name\": \"test-client\", \"redirect_uris\": [\"http://localhost:8080/cb\"]}'"
