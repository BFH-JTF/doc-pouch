// Minimal runtime mock for `docpouch-client` used in server tests.
// Keep methods that tests or server code may call at runtime.

class DbPouchClient {
    constructor(/* baseUrl, port, networkHandler */) {
        // no-op
    }

    // runtime methods that server-side code or other modules might call in tests
    setToken(/* token */) {
        // no-op
    }

    setRealTimeSync(/* enabled */) {
        // no-op
    }

    // example API methods used in client code - return resolved promises to keep tests working
    async listUsers() {
        return [];
    }

    async listDocuments() {
        return [];
    }

    async getStructures() {
        return [];
    }

    async getTypes() {
        return [];
    }

    async updateDocument(/* id, doc */) {
        return {};
    }

    async removeDocument(/* id */) {
        return {};
    }

    async createDocument(/* doc */) {
        return {};
    }

    async updateUser(/* id, data */) {
        return {};
    }

    async removeUser(/* id */) {
        return {};
    }

    async updateType(/* type */) {
        return {};
    }

    async removeStructure(/* id */) {
        return {};
    }

    // add more no-op methods as needed by your code under test
}

export default DbPouchClient;

// Minimal value placeholders for any named imports used at runtime.
export const I_UserCreation = {};
export const I_UserUpdate = {};
export const I_DocumentType = {};
export const I_UserEntry = {};
export const I_DocumentEntry = {};
export const I_DataStructure = {};
export const I_LoginResponse = {};
export const I_EventString = {};
