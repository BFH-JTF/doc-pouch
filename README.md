# DocPouch

DocPouch is a light-weight, document-based database including user management. It provides a simple yet flexible way to
store and manage structured documents.

A client library can be found here: [docpouch-client](https://github.com/BFH-JTF/docpouch-client)
## Purpose and Use Cases

DocPouch is primarily intended for:
- **Development environments**: Ideal for prototyping and developing applications that need document storage
- **Testing environments**: Perfect for testing applications without setting up complex database systems
- **Secure internal environments**: Suitable for internal applications where security is not a major concern

> **Note**: DocPouch is not designed for high-performance production environments or applications requiring advanced
> security features. The database is file and text-based, prioritizing simplicity and a small footprint over performance.

DocPouch handles users, documents, document types, and document structures.
### Users
A user entry describes a system user including the name, password, role, and email (if provided)

### Documents

Documents store the main data. They can be all sort of data objects as long as they can be express in JSON. They can
follow their own structure or follow an existing document structure.

Documents have access control settings:

- **Private**: Only the owner and administrators can access the document.
- **Shared with Group**: All users in the owner's group can read the document.
- **Shared with Department**: All users in the owner's department can read the document.
- **Public**: All authenticated users can read the document.

Owners can change these settings in the document editor.

### Document Types

Document types provide a way to categorize and classify documents. Each document type has:

- **Name**: A descriptive name for the type
- **Description**: Additional information about the type
- **Type**: A numeric identifier for the type category
- **SubType**: A numeric identifier for sub-categorization

Document types help organize documents and can be used for filtering and querying. For example, you might have document
types like "Invoice", "Report", or "Contract" with different type/subType codes.

### Document Structures
Document structures describe how documents following this structure are structured and what information they hold.
They contain a separate DataElement for each field of the data structure in their "fields" property.

**Example for a document structure with two fields**
```
{
    "_id": "tt5vo04DN3jm8Bqe",
    "title": "City Info",
    "fields": [
        {
            "name": "City name",
            "type": "string",
        },
        {
            "name": "# of inhabitants",
            "type": "number"
        }
    ]
}
```

#### Arrays of items
Arrays of items are specified using the type "array" and indicating the type of the array elements in "items".

#### Referencing other document structures
Document structures can refer to other document structures to build more complex data interrelations.
To reference a document structure inside another structure, the "items" property in the DataElement is used.

**Example for a document structure referencing another**  
This structure consists of the name of the street plus an array of data structures named "Houses" described in the data structure ```g33vo0rPd3jmfBqe```.
The "items" field can therefore only be used in combination with the types *array* or *structure*.
```
{
    "_id": "tt5vo04DN3jm8Bqe",
    "title": "Street Info",
    "fields": [
        {
            "name": "Street name",
            "type": "string",
        },
        {
            "name": "Alternative names",
            "type": "array",
            "items": "string"
        },
        {
            "name": "houses",
            "type": "array",
            "items": "g33vo0rPd3jmfBqe"
        }
    ]
}
```
A fitting document structure for houses could look like this:
```
{
    "_id": "g33vo0rPd3jmfBqe",
    "title": "House Info",
    "fields": [
        {
            "name": "Has fiber glass connection",
            "type": "boolean",
        },
        {
            "name": "Number of inhabitants",
            "type": "number",
        },
        {
            "name": "Is connected to the gas grid",
            "type": "boolean",
        }
    ]
}
```

#### Application in documents
Documents using a document structure have to structure their content like this:
```
{
  "content": {
    "structureID": [ID of used document structure],
    "structuredData": [object structured as dictated by document structure]
  }
}
```

## Getting Started with Docker

### Using Docker Compose (Recommended)

To run DocPouch using Docker Compose, create a `docker-compose.yml` file with the following content:

```yaml
services:
  doc-pouch:
    image: ghcr.io/bfh-jtf/doc-pouch:latest
    ports:
      - "3030:3030"
    volumes:
      - "./db:/app/db"
      - "./log:/app/log"
    environment:
      - PORT=3030
      - MEMORY_ONLY=false
    restart: unless-stopped
```

Then, run the following command to start the application:

```bash
docker compose up -d
```

### Using Docker CLI

Alternatively, you can run DocPouch directly using the Docker CLI:

```bash
docker run -d \
  --name doc-pouch \
  -p 3030:3030 \
  -v ./db:/app/db \
  -v ./log:/app/log \
  ghcr.io/bfh-jtf/doc-pouch:latest
```

### Configuration

DocPouch can be configured using environment variables:

| Variable      | Description                                                                | Default     |
|---------------|----------------------------------------------------------------------------|-------------|
| `PORT`        | The port the server will listen on.                                        | `3030`      |
| `MEMORY_ONLY` | Set to `true` to use an in-memory database (data will be lost on restart). | `false`     |
| `PREFIX`      | Prefix for database filenames.                                             | `docpouch-` |

### Persisting Data

To persist your data and logs, ensure you mount volumes for `/app/db` and `/app/log` as shown in the examples above.

### Initial Credentials

On the first start, DocPouch creates a default administrator account:

- **Username**: `admin`
- **Password**: `adminSecret`

> **Security Note**: Please change the administrator password immediately after the first login.

## API

DocPouch provides a RESTful API with an [OpenAPI documentation]() and the following main endpoints:

### User Management
- `POST /users/login` - Authenticate a user and receive a JWT token
- `GET /users/list` - List user information (all users for admins, own info for regular users)
- `POST /users/create` - Create a new user (admin only)
- `PATCH /users/update/{userID}` - Update user information
- `DELETE /users/remove/{userID}` - Remove a user and all their documents (admin only)

### Document Management

- `GET /docs/list` - List all documents readable by the user (including public ones)
- `POST /docs/fetch` - Get documents based on a query object (including public ones)
- `POST /docs/create` - Create a new document
- `PATCH /docs/update/{documentID}` - Update an existing document
- `DELETE /docs/remove/{documentID}` - Remove a document
- `GET /docs/fetch/{documentID}` - Get a specific document by ID (deprecated, use /docs/fetch)

### Document Type Management

- `GET /types/list` - Get all document types
- `POST /types/create` - Create a new document type
- `PATCH /types/update/{typeID}` - Update a document type
- `DELETE /types/remove/{typeID}` - Remove a document type

### Data Structure Management
- `GET /structures/list` - Get all data structures
- `POST /structures/create` - Create a new data structure (admin only)
- `PATCH /structures/update/{structureID}` - Update an existing data structure (admin only)
- `DELETE /structures/remove/{structureID}` - Remove a data structure (admin only)

All API endpoints (except login) require authentication using JWT tokens. You can find an OpenAPI specification
in the `docpouch_openAPI.yaml` file.

> **Note**: API endpoints use standard HTTP response codes: `201` (Created), `204` (No Content), `403` (Forbidden), etc.

## Real-Time Updates

DocPouch supports WebSocket-based real-time updates using Socket.io. Events are triggered for documents, users,
structures, and types.

To simplify integration, use the official client library: [docpouch-client](https://github.com/BFH-JTF/docpouch-client),
which handles authentication, connection, and event handling.

## Frontend UI

The DocPouch frontend provides an intuitive interface for managing documents, users, and data structures:

### Main Features
- **User Management**: Create, view, update, and delete user accounts (admin only)
- **Document Management**: View, edit, and delete documents with structured content
- **Document Structure Management**: View document structures with various field types