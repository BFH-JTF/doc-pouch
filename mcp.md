# MCP Server for DocPouch

DocPouch includes an embedded [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that allows AI
agents and LLM-powered tools to interact with documents, structures, and users through a structured, typed interface.

## Overview

The MCP server is mounted inside the existing Node/Express process at `/mcp`. It uses the Streamable HTTP transport (no
separate stdio process) and reuses the same JWT/OIDC/API key bearer token authentication as the REST API.

## Enabling / Disabling

The MCP server is **enabled by default**. To disable it, set the environment variable:

```
MCP_ENABLED=false
```

No restart is needed beyond the normal server restart for environment changes.

## Connecting

MCP clients connect via HTTP POST to:

```
http://<host>:<port>/mcp
```

Authentication uses the same `Authorization: Bearer <token>` header as the REST API. Tokens are obtained via:

- `POST /users/login` (JWT token)
- OIDC authorization flow
- API keys (created via the admin UI: Menu → API Keys)

### Example with curl

```bash
# Get a JWT token
TOKEN=$(curl -s -X POST http://localhost:3030/users/login \
  -H "Content-Type: application/json" \
  -d '{"name":"admin","password":"your-password"}' | jq -r '.token')

# Initialize an MCP session
curl -X POST http://localhost:3030/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "my-client", "version": "1.0.0"}
    }
  }'
```

### Example with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "docpouch": {
      "url": "http://localhost:3030/mcp",
      "headers": {
        "Authorization": "Bearer <your-jwt-token>"
      }
    }
  }
}
```

## Tools

All tools require a valid `Authorization: Bearer <token>` header. Access control matches the REST API: non-admin users
can only access their own data; admins can access everything.

### Documents

| Tool              | Input                                                                                                      | Notes                                                    |
|-------------------|------------------------------------------------------------------------------------------------------------|----------------------------------------------------------|
| `list_documents`  | `{ query?: { type?, subType?, owner?, public?, shareWithGroup?, shareWithDepartment?, limit? } }`          | Defaults: `limit=100`, max `500`.                        |
| `get_document`    | `{ id: string }`                                                                                           | Returns 404-style error if not accessible.               |
| `create_document` | `{ type, subType, title, content, public, shareWithGroup, shareWithDepartment, description?, anonymous? }` | `anonymous=true` requires `ANONYMOUS_DOCUMENTS_ENABLED`. |
| `update_document` | `{ id, title?, description?, content?, public?, shareWithGroup?, shareWithDepartment? }`                   | Owner/admin: all fields. Non-owner: content only.        |
| `delete_document` | `{ id: string }`                                                                                           | Owner/admin only.                                        |

### Structures

| Tool               | Input                                                   | Notes                                 |
|--------------------|---------------------------------------------------------|---------------------------------------|
| `list_structures`  | `{}`                                                    | Available to all authenticated users. |
| `get_structure`    | `{ id: string }`                                        | Available to all authenticated users. |
| `create_structure` | `{ name, fields, description?, type?, subType? }`       | Admin only.                           |
| `update_structure` | `{ id, name?, description?, type?, subType?, fields? }` | Admin only.                           |
| `delete_structure` | `{ id: string }`                                        | Admin only.                           |

### Users

| Tool          | Input                                                             | Notes                                                         |
|---------------|-------------------------------------------------------------------|---------------------------------------------------------------|
| `whoami`      | `{}`                                                              | Returns the authenticated user's profile.                     |
| `list_users`  | `{}`                                                              | Admin: all users. Non-admin: own profile only.                |
| `get_user`    | `{ id: string }`                                                  | Admin: any user. Non-admin: self only.                        |
| `create_user` | `{ name, password, department, group, isAdmin, email? }`          | Admin only.                                                   |
| `update_user` | `{ id, name?, password?, email?, department?, group?, isAdmin? }` | Self for non-`isAdmin` changes; admin required for `isAdmin`. |
| `delete_user` | `{ id: string }`                                                  | Admin only.                                                   |

## Resources

| URI Pattern                  | Returns                      | Auth                              |
|------------------------------|------------------------------|-----------------------------------|
| `docpouch://documents/{id}`  | Document JSON                | Same as `get_document`            |
| `docpouch://structures/{id}` | Structure JSON               | Any authenticated user            |
| `docpouch://users/{id}`      | User JSON (no password hash) | Admin only (non-admin: self only) |

## Security

- Tokens are bearer tokens — the same JWT or OIDC tokens used by the REST API.
- Access control is identical to the REST API: no separate MCP-only permissions.
- The `MCP_ENABLED=false` flag disables the MCP endpoint entirely.
- Rate limiting for MCP requests should be added in a future release; currently MCP requests are not separately
  rate-limited.

## Architecture

- **Transport:** Streamable HTTP only (no stdio transport in this version).
- **Stateless sessions:** Each request carries its own bearer token; no session state is maintained.
- **Validation:** All mutation tools call `SchemaValidator.getValidatedObject()` after Zod parsing, ensuring the same
  Yup constraints as the REST API.
- **Auth:** Extracted into `src/srv/mcp/auth.ts`, shared with `NetworkManager.authenticate`.