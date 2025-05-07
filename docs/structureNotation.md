# Document Structures
Document structures describe how documents are structured and what information they hold.
They contain a separate DataElement for each field of the data structure in their "fields" property. 

## Description
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
Document structures can contain other document structures to build more complex data interrelations.
To reference a document structure inside another structure the "reference" property is used.

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
A fitting document structure could look like this:
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
Documents using a document structure have to structure their content as follows:
```
{
  "content": {
    structureID: [ID of used document structure],
    data: [object structured as dictated by document structure]
  }
}
```

