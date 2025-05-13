# DocPouch

DocPouch is a light-weight, document-based database including user management. It provides a simple yet flexible way to
store and manage structured documents.

## Purpose and Use Cases

DocPouch is primarily intended for:
- **Development environments**: Ideal for prototyping and developing applications that need document storage
- **Testing environments**: Perfect for testing applications without setting up complex database systems
- **Secure internal environments**: Suitable for internal applications where security is not a major concern

> **Note**: DocPouch is not designed for high-performance production environments or applications requiring advanced 
> security features. The database is file and text-based, prioritizing simplicity and a small footprint over performance.

DocPouch handles users, documents and document structures.
### Users
A user entry describes a system user including the name, password, role, and email (if provided)

### Documents
Documents store the main data. They can be all sort of data objects as long as they can be express in JSON. They can 
follow their own structure or follow an existing document structure.

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
## Referencing other document structures
Document structures can refer to other document structures to build more complex data interrelations.
To reference a document structure inside another structure, the "reference" property in the DataElement is used.

**Example for a document structure referencing another**  
This structure consists of the name of the street plus an array of data structures named "Houses" described in the data structure ```g33vo0rPd3jmfBqe```.
The "reference" field can therefore only be used in combination with the types *array* or *structure*.
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
            "name": "houses",
            "type": "array",
            "reference": "g33vo0rPd3jmfBqe"
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
            "name": "Average age of inhabitants",
            "type": "number",
        }
    ]
}
```

## Application in documents
Documents using a document structure have to structure their content like this:
```
{
  "content": {
    "structureID": [ID of used document structure],
    "structuredData": [object structured as dictated by document structure]
  }
}
```



## API

DocPouch provides a RESTful API with the following main endpoints:

### User Management
- `POST /users/login` - Authenticate a user and receive a JWT token
- `GET /users/list` - List user information (all users for admins, own info for regular users)
- `POST /users/create` - Create a new user (admin only)
- `PATCH /users/update/{userID}` - Update user information
- `DELETE /users/remove/{userID}` - Remove a user and all their documents (admin only)

### Document Management
- `GET /docs/list` - List all documents (owned by the user or all for admins)
- `GET /docs/fetch/{documentID}` - Get a specific document by ID
- `POST /docs/create` - Create a new document
- `PATCH /docs/update/{documentID}` - Update an existing document
- `DELETE /docs/remove/{documentID}` - Remove a document

### Data Structure Management
- `GET /structures/list` - Get all data structures
- `POST /structures/create` - Create a new data structure (admin only)
- `PATCH /structures/update/{structureID}` - Update an existing data structure (admin only)
- `DELETE /structures/remove/{structureID}` - Remove a data structure (admin only)

All API endpoints (except login) require authentication using JWT tokens. You can find an openAPI specification 
in the `docPouch.yml` file

## Frontend UI

The DocPouch frontend provides an intuitive interface for managing documents, users, and data structures:

### Main Features
- **User Management**: Create, view, update, and delete user accounts (admin only)
- **Document Management**: View, edit, and delete documents with structured content
- **Document Structure Management**: View document structures with various field types