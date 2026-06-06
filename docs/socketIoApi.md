
# Socket.io API Documentation for DocPouch

This document describes the WebSocket API for the DocPouch application. The API is implemented using Socket.io and enables real-time updates for documents, structures, and user management.

## Connection and Authentication

### Establishing a Connection

To connect to the WebSocket API, you need to use Socket.io client and provide a JWT token in the connection handshake:

```javascript
const socket = io.connect('http://yourserver:port', {
  auth: {
    token: 'your-jwt-token'  // Obtained from /users/login REST endpoint
  }
});
```

The JWT token must be obtained first by authenticating through the REST API endpoint `/users/login`.

### Authentication Error Handling
If authentication fails, the connection will be rejected with an authentication error:

```javascript
socket.on('connect_error', (error) => {
  console.log('Connection error:', error.message);
  // Handle authentication failure
});
```

## Client to Server Events

The Socket.io server automatically handles client connections and authentication. No manual subscription is required.

| Event Name      | Description                         | Expected Payload | Response |
|-----------------|-------------------------------------|------------------|----------|
| `heartbeatPong` | Response to server's heartbeat ping | None             | None     |

**Note**: Unlike the previous version, there are no `subscribe`/`unsubscribe` events. Real-time updates are
automatically enabled upon successful authentication.

### Example: Handling Connection

```javascript
socket.on('connect', () => {
    console.log('Connected and automatically subscribed to updates');
    // No need to emit 'subscribe' - it's automatic
});
```

## Server to Client Events

These are the events that the server emits to clients. The payload of every event is a single object
implementing the `I_WsMessage` interface from `docpouch-client`; only the relevant property is set for a given
event.

| Event Name              | Description                                | Payload Property                      | Triggered By            | Access             |
|-------------------------|--------------------------------------------|---------------------------------------|-------------------------|--------------------|
| `heartbeatPing`         | Server checking if client is alive         | _(none)_                              | Sent every 60 seconds   | All clients        |
| `newDocument`           | Notifies about new document creation       | `newDocument: I_DocumentEntry`        | Document creation       | Document accessors |
| `changedDocument`       | Notifies about document updates            | `changedDocument: I_DocumentUpdate`   | Document update         | Document accessors |
| `removedDocument`       | Notifies about document deletion           | `removedID: string`                   | Document deletion       | Document accessors |
| `newUser`               | Notifies about new user creation           | `newUser: I_UserEntry`                | User creation           | Admin only         |
| `changedUser`           | Notifies about user updates                | `changedUser: I_UserUpdate`           | User update             | Admin only         |
| `removedUser`           | Notifies about user deletion               | `removedID: string`                   | User deletion           | Admin only         |
| `newStructure`          | Notifies about new structure creation      | `newStructure: I_DataStructure`       | Structure creation      | All clients        |
| `changedStructure`      | Notifies about structure updates           | `changedStructure: I_StructureUpdate` | Structure update        | All clients        |
| `removedStructure`      | Notifies about structure deletion          | `removedID: string`                   | Structure deletion      | All clients        |
| `databaseInconsistency` | Notifies admin about data integrity issues | `faultyDocuments: I_DocumentEntry[]`  | Admin socket connection | Admin only         |

> The `newType`, `changedType`, and `removedType` events are reserved for the deprecated document-type system and
> are never emitted by the current server. The `types` collection itself is kept on disk only for backward
> compatibility with pre-1.9.x databases.

### Example: Handling Events with DocPouch Client

```javascript
function handleNetworkEvent(event, data) {
    switch (event) {
        case "newDocument":
            console.log('New document created:', data.newDocument);
            // Update UI with the new document
            break;

        case "changedDocument":
            console.log('Document updated:', data.changedDocument);
            // Update UI with the changed document
            break;

        case "removedDocument":
            console.log('Document removed:', data.removedID);
            // Remove document from UI
            break;

        case "newUser":
            // Only received by admin users
            console.log('New user created:', data.newUser);
            break;

        case "changedUser":
        case "removedUser":
            // Refresh the user list as an admin
            break;

        case "newStructure":
        case "changedStructure":
        case "removedStructure":
            // Refresh structure list (visible to all clients)
            break;

        case "databaseInconsistency":
            // Only received by admin users on connect
            console.warn('Database inconsistency detected:', data.faultyDocuments);
            break;
    }
}
```

## Heartbeat Mechanism

The server implements a heartbeat mechanism to detect disconnected clients:

1. Server sends a `heartbeatPing` event every 60 seconds
2. Client must respond with a `heartbeatPong` event
3. Clients that don't respond within 120 seconds are automatically disconnected

**Note**: When using the DocPouch client library, heartbeat handling is automatic.

### Manual Heartbeat Handling (Direct Socket.io)

```javascript
socket.on('heartbeatPing', () => {
    socket.emit('heartbeatPong');
});
```

## Access Control and Event Distribution

Events are sent to clients based on their permissions and document access rights:

- **Document events**: Sent to document owners, users with shared access (department/group sharing), and admin users
- **User events**: Sent only to admin users
- **Structure events**: Sent to all connected clients

The server implements sophisticated access control through methods like:

- `sendEventToUser()`: Sends events to specific users
- `sendEventToAdmins()`: Sends events only to admin users
- `sendEventToDocumentAccessors()`: Sends document-related events to users with access
- `sendEventToAllClients()`: Broadcasts to all connected clients

## Complete DocPouch Client Example

Here's a complete example using the DocPouch client library:

```javascript
import DbPouchClient from 'docpouch-client';

// Create client instance
const apiClient = new DbPouchClient(
    window.location.href.slice(0, window.location.href.lastIndexOf('/')),
    3030,
    handleNetworkEvent
);

// Handle network events
function handleNetworkEvent(event, data) {
    switch (event) {
        case "newDocument":
        case "changedDocument":
        case "removedDocument":
            // Refresh document list
            refreshDocuments();
            break;

        case "newUser":
        case "changedUser":
        case "removedUser":
            console.log('User event:', data.removedID || data.newUser || data.changedUser);
            break;

        case "newStructure":
        case "changedStructure":
        case "removedStructure":
            // Refresh structure list
            refreshStructures();
            break;

        case "databaseInconsistency":
            // Only received by admin users on connect
            console.warn('Database inconsistency detected:', data.faultyDocuments);
            break;
    }
}

// Login and setup
async function setupClient() {
    try {
        // Login (JWT)
        const loginResponse = await apiClient.login({
            name: 'username',
            password: 'password'
        });

        // Set token
        apiClient.setToken(loginResponse.token);

        // Enable real-time updates
        apiClient.setRealTimeSync(true);

        console.log('Client setup complete with real-time sync enabled');

    } catch (error) {
        console.error('Setup failed:', error);
    }
}

// Helper functions
async function refreshDocuments() {
    const documents = await apiClient.listDocuments();
    // Update UI with documents
}

async function refreshUsers() {
    const users = await apiClient.listUsers();
    // Update UI with users
}

async function refreshStructures() {
    const structures = await apiClient.getStructures();
    // Update UI with structures
}
```

## Direct Socket.io Example (Advanced)

For direct Socket.io usage without the client library:

```javascript
// Get JWT token from login
const token = await loginUser(username, password);

// Establish Socket.io connection
const socket = io.connect('http://yourserver:port', {
    auth: {token}
});

// Connection handling
socket.on('connect', () => {
    console.log('Connected to WebSocket server');
    // Real-time updates are automatically enabled
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
});

socket.on('disconnect', () => {
    console.log('Disconnected from WebSocket server');
});

// Heartbeat handling
socket.on('heartbeatPing', () => {
    socket.emit('heartbeatPong');
});

// Event handlers
socket.on('newDocument', (data) => {
    console.log('New document created:', data.newDocument);
});

socket.on('changedDocument', (data) => {
    console.log('Document updated:', data.changedDocument);
});

socket.on('removedDocument', (data) => {
    console.log('Document removed:', data.removedID);
});

// Admin-only events
socket.on('newUser', (data) => {
    console.log('New user created:', data.newUser);
});

socket.on('changedUser', (data) => {
    console.log('User updated:', data.changedUser);
});

socket.on('removedUser', (data) => {
    console.log('User removed:', data.removedID);
});

// Structure events
socket.on('newStructure', (data) => {
    console.log('New structure created:', data.newStructure);
});

socket.on('changedStructure', (data) => {
    console.log('Structure updated:', data.changedStructure);
});

socket.on('removedStructure', (data) => {
    console.log('Structure removed:', data.removedID);
});
```

## Message Structure

All data is sent using the `I_WsMessage` interface (re-exported by `docpouch-client`), which may contain one of
the following properties:

- `newDocument: I_DocumentEntry` — a newly created document
- `changedDocument: I_DocumentUpdate` — a partial document update
- `removedID: string` — the `_id` of a removed document, user, or structure
- `newUser: I_UserEntry` — a newly created user
- `changedUser: I_UserUpdate` — a partial user update
- `newStructure: I_DataStructure` — a newly created data structure
- `changedStructure: I_StructureUpdate` — a partial data structure update
- `faultyDocuments: I_DocumentEntry[]` — a list of documents that fail the consistency check (admin only)
- `heartbeatPing: number` / `heartbeatPong: number` — heartbeat plumbing

Note that `removedID` is a single shared payload field used for all three "removed" events (`removedDocument`,
`removedUser`, `removedStructure`); the event name disambiguates which collection it refers to.

## Implementation Notes

- The Socket.io server runs on the same port as the REST API
- CORS is enabled with `origin: "*"` for development purposes
- Inactive clients are automatically disconnected after 120 seconds without response to a heartbeat
- JWT tokens expire after 24 hours by default; OIDC access tokens are short-lived (1 hour) and the client
  library transparently refreshes them
- **DocPouch Client Library** handles all Socket.io complexity automatically
- Real-time synchronization is managed by calling `apiClient.setRealTimeSync(true/false)`
- Document sharing permissions (department/group sharing) are automatically respected for event distribution
- Authentication and subscription happen automatically upon successful connection — both JWT and OIDC access
  tokens are accepted on the socket handshake
- The client library is available as `docpouch-client` npm package

## API Client Methods

When using the DocPouch client library, these methods automatically trigger the corresponding Socket.io events:

- `apiClient.createDocument()` → triggers `newDocument` events
- `apiClient.updateDocument()` → triggers `changedDocument` events
- `apiClient.removeDocument()` → triggers `removedDocument` events
- `apiClient.createUser()` → triggers `newUser` events (admin only)
- `apiClient.updateUser()` → triggers `changedUser` events (admin only)
- `apiClient.removeUser()` → triggers `removedUser` events (admin only)
- `apiClient.createStructure()` → triggers `newStructure` events
- `apiClient.updateStructure()` → triggers `changedStructure` events
- `apiClient.removeStructure()` → triggers `removedStructure` events

