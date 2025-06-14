# Socket.io API Documentation for DocPouch
This document describes the WebSocket API for the DocPouch application. The API is implemented using Socket.io and enables real-time updates for documents, structures, and user management.
## Connection and Authentication
### Establishing a Connection
To connect to the WebSocket API, you need to use Socket.io client and provide a JWT token in the connection handshake:
``` javascript
const socket = io.connect('http://yourserver:port', {
  auth: {
    token: 'your-jwt-token'  // Obtained from /users/login REST endpoint
  }
});
```
The JWT token must be obtained first by authenticating through the REST API endpoint. `/users/login`
### Authentication Error Handling
If authentication fails, the connection will be rejected with an authentication error:
``` javascript
socket.on('connect_error', (error) => {
  console.log('Connection error:', error.message);
  // Handle authentication failure
});
```
## Client to Server Events
These are the events that clients can emit to the server:

| Event Name | Description | Expected Payload | Response |
| --- | --- | --- | --- |
| `subscribe` | Subscribe to receive real-time updates | None | Server emits `confirmSubscription` |
| `unsubscribe` | Unsubscribe from real-time updates | None | Server emits `confirmUnsubscription` |
| `heartbeatPong` | Response to server's heartbeat ping | None | None |
### Example: Subscribing to Updates
``` javascript
socket.emit('subscribe');

socket.on('confirmSubscription', () => {
  console.log('Successfully subscribed to updates');
});
```
## Server to Client Events
These are the events that the server emits to clients:

| Event Name | Description | Payload Structure | Triggered By |
| --- | --- | --- | --- |
| `heartbeatPing` | Server checking if client is alive | None | Sent every 60 seconds |
| `confirmSubscription` | Confirms successful subscription | None | Client's `subscribe` event |
| `confirmUnsubscription` | Confirms successful unsubscription | None | Client's `unsubscribe` event |
| `newDocument` | Notifies about new document creation | `{ newDocument: { _id: string, title: string, ... } }` | Document creation |
| `changedDocument` | Notifies about document updates | `{ changedDocument: { _id: string, ... } }` | Document update |
| `removedDocument` | Notifies about document deletion | `{ removedID: string }` | Document deletion |
| `newUser` | Notifies about new user creation (admin only) | `{ newUser: { _id: string, name: string, ... } }` | User creation |
| `changedUser` | Notifies about user updates (admin only) | `{ changedUser: { _id: string, ... } }` | User update |
| `removedUser` | Notifies about user deletion (admin only) | `{ removedID: string }` | User deletion |
| `newStructure` | Notifies about new structure creation (admin only) | `{ newStructure: { _id: string, name: string, ... } }` | Structure creation |
| `changedStructure` | Notifies about structure updates (admin only) | `{ changedStructure: { _id: string, ... } }` | Structure update |
| `removedStructure` | Notifies about structure deletion | `{ removedID: string }` | Structure deletion |
### Example: Handling Document Updates
``` javascript
socket.on('newDocument', (data) => {
  console.log('New document created:', data.newDocument);
  // Update UI with the new document
});

socket.on('changedDocument', (data) => {
  console.log('Document updated:', data.changedDocument);
  // Update UI with the changed document
});

socket.on('removedDocument', (data) => {
  console.log('Document removed:', data.removedID);
  // Remove document from UI
});
```
## Heartbeat Mechanism
The server implements a heartbeat mechanism to detect disconnected clients:
1. Server sends a event every 60 seconds `heartbeatPing`
2. Client must respond with a event `heartbeatPong`
3. Clients that don't respond within 120 seconds are disconnected

### Example: Implementing Heartbeat Response
``` javascript
socket.on('heartbeatPing', () => {
  socket.emit('heartbeatPong');
});
```
## Access Control
Events are sent to clients based on their permissions:
- Regular users receive events related to their own documents
- Admin users additionally receive events about all users, all documents, and structures

## Complete Client Example
Here's a complete example of a Socket.io client implementation:
``` javascript
// Get JWT token from login
const token = await loginUser(username, password);

// Establish Socket.io connection
const socket = io.connect('http://yourserver:port', {
  auth: { token }
});

// Connection handling
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  socket.emit('subscribe');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket server');
});

// Subscription confirmation
socket.on('confirmSubscription', () => {
  console.log('Successfully subscribed to updates');
});

socket.on('confirmUnsubscription', () => {
  console.log('Successfully unsubscribed from updates');
});

// Heartbeat handling
socket.on('heartbeatPing', () => {
  socket.emit('heartbeatPong');
});

// Document events
socket.on('newDocument', (data) => {
  console.log('New document created:', data.newDocument);
});

socket.on('changedDocument', (data) => {
  console.log('Document updated:', data.changedDocument);
});

socket.on('removedDocument', (data) => {
  console.log('Document removed:', data.removedID);
});

// Admin-only events (will only be received if user is admin)
socket.on('newUser', (data) => {
  console.log('New user created:', data.newUser);
});

socket.on('changedUser', (data) => {
  console.log('User updated:', data.changedUser);
});

socket.on('removedUser', (data) => {
  console.log('User removed:', data.removedID);
});

socket.on('newStructure', (data) => {
  console.log('New structure created:', data.newStructure);
});

socket.on('changedStructure', (data) => {
  console.log('Structure updated:', data.changedStructure);
});

socket.on('removedStructure', (data) => {
  console.log('Structure removed:', data.removedID);
});

// To unsubscribe
function unsubscribe() {
  socket.emit('unsubscribe');
}

// Disconnect when done
function disconnect() {
  socket.disconnect();
}
```
## Message Structure
All data is sent using the interface, which may contain one of the following properties: `I_WsMessage`
- : Contains a newly created document `newDocument`
- : Contains a document update `changedDocument`
- : Contains the ID of a removed entity `removedID`
- : Contains a newly created user `newUser`
- : Contains a user update `changedUser`
- : Contains a newly created structure `newStructure`
- : Contains a structure update `changedStructure`

## Implementation Notes
- The Socket.io server runs on the same port as the REST API
- CORS is enabled with for development purposes `origin: "*"`
- Inactive clients are automatically disconnected after 120 seconds without response
- JWT tokens expire after 4 hours by default
