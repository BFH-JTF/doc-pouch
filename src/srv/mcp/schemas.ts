import {z} from 'zod';

export const ListDocumentsSchema = z.object({
    query: z.object({
        _id: z.string().optional()
            .describe('Filter by exact document ID. Useful for checking if a specific document exists.'),
        title: z.string().optional()
            .describe('Filter by document title. Case-insensitive exact match.'),
        type: z.number().optional()
            .describe('Filter by document type (numeric identifier).'),
        subType: z.number().optional()
            .describe('Filter by document subtype (numeric identifier).'),
        owner: z.string().optional()
            .describe('Filter by document owner user ID. Only returns documents owned by the specified user.'),
        public: z.boolean().optional()
            .describe('Filter by public visibility. true returns only public documents, false returns only private documents.'),
        shareWithGroup: z.boolean().optional()
            .describe('Filter by group sharing flag. true returns only documents shared with the owner\'s group, false returns only documents not shared with the group.'),
        shareWithDepartment: z.boolean().optional()
            .describe('Filter by department sharing flag. true returns only documents shared with the owner\'s department, false returns only documents not shared with the department.'),
        limit: z.number().int().min(1).max(500).default(100)
            .describe('Maximum number of documents to return. Defaults to 100, maximum 500.'),
    }).optional().default({limit: 100}),
});

export const GetDocumentSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the document to retrieve.'),
});

export const CreateDocumentSchema = z.object({
    type: z.number()
        .describe('Document type identifier (numeric). Determines the broad category of the document.'),
    subType: z.number()
        .describe('Document subtype identifier (numeric). Determines the specific kind within the type.'),
    title: z.string().min(1)
        .describe('Document title. A human-readable name for the document.'),
    description: z.string().optional()
        .describe('Optional longer description of the document content or purpose.'),
    content: z.any()
        .describe('Document content. Can be any JSON-serializable value — a string, number, object, or array. String values that contain valid JSON are automatically parsed.'),
    public: z.boolean()
        .describe('Whether the document is publicly visible to all users, regardless of group or department membership.'),
    shareWithGroup: z.boolean()
        .describe('Whether the document is visible to all users in the same group as the owner.'),
    shareWithDepartment: z.boolean()
        .describe('Whether the document is visible to all users in the same department as the owner.'),
    anonymous: z.boolean().optional().default(false)
        .describe('If true, the document owner is set to the admin user instead of the authenticated user. Requires the ANONYMOUS_DOCUMENTS_ENABLED server setting. Useful for submissions where the author\'s identity should not be stored.'),
});

export const UpdateDocumentSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the document to update.'),
    title: z.string().optional()
        .describe('New title for the document.'),
    description: z.string().optional()
        .describe('New description for the document.'),
    content: z.any().optional()
        .describe('New content for the document. Replaces the existing content entirely.'),
    public: z.boolean().optional()
        .describe('New public visibility setting.'),
    shareWithGroup: z.boolean().optional()
        .describe('New group sharing setting.'),
    shareWithDepartment: z.boolean().optional()
        .describe('New department sharing setting.'),
});

export const DeleteDocumentSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the document to delete. Only the document owner or an admin can delete a document.'),
});

export const ListStructuresSchema = z.object({})
    .describe('List all document structures. Returns an array of all structure definitions in the database. Available to any authenticated user.');

export const GetStructureSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the document structure to retrieve.'),
});

export const CreateStructureSchema = z.object({
    name: z.string().min(1)
        .describe('Human-readable name for the structure (e.g. "Incident Report", "Meeting Minutes").'),
    description: z.string().optional()
        .describe('Optional longer description of the structure\'s purpose and usage.'),
    type: z.number()
        .describe('Structure type identifier (numeric). Groups related structures together.'),
    subType: z.number()
        .describe('Structure subtype identifier (numeric). Identifies the specific kind within the type.'),
    fields: z.array(z.object({
        name: z.string().min(1)
            .describe('Field identifier used in document content (e.g. "title", "description", "incidentDate").'),
        displayName: z.string().optional()
            .describe('Human-readable label shown in the UI (e.g. "Title", "Description", "Incident Date").'),
        type: z.string().min(1)
            .describe('Field data type: "string", "number", "boolean", "date", "array", or "object".'),
        items: z.string().optional()
            .describe('For fields of type "array" or "object", specifies the item/sub-field type. For "array" fields this is the type of each element. For reference fields this is the ID of another structure.'),
    })).min(1)
        .describe('Array of field definitions that describe the expected structure of documents using this template. Must contain at least one field.'),
});

export const UpdateStructureSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the structure to update.'),
    name: z.string().optional()
        .describe('New name for the structure.'),
    description: z.string().optional()
        .describe('New description for the structure.'),
    type: z.number()
        .describe('Structure type identifier. Required even when not changing, because it is part of the structure identity.'),
    subType: z.number()
        .describe('Structure subtype identifier. Required even when not changing, because it is part of the structure identity.'),
    fields: z.array(z.object({
        name: z.string().min(1)
            .describe('Field identifier.'),
        displayName: z.string().optional()
            .describe('Human-readable label for the field.'),
        type: z.string().min(1)
            .describe('Field data type.'),
        items: z.string().optional()
            .describe('Item type for array/object/reference fields.'),
    })).optional()
        .describe('Complete new set of field definitions. If provided, replaces all existing fields. If omitted, the existing fields are preserved.'),
});

export const DeleteStructureSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the structure to delete. Admin only.'),
});

export const ListAnonymousStructuresSchema = z.object({})
    .describe('List all structure type/subType pairs that allow anonymous document creation. Available to any authenticated user.');

export const SetAnonymousStructureSchema = z.object({
    type: z.number()
        .describe('Structure type identifier (numeric). The type of the structure that should allow anonymous document creation.'),
    subType: z.number()
        .describe('Structure subtype identifier (numeric). The subtype of the structure that should allow anonymous document creation.'),
});

export const RemoveAnonymousStructureSchema = z.object({
    type: z.number()
        .describe('Structure type identifier (numeric). The type of the structure to remove from the anonymous allowlist.'),
    subType: z.number()
        .describe('Structure subtype identifier (numeric). The subtype of the structure to remove from the anonymous allowlist.'),
});

export const WhoamiSchema = z.object({})
    .describe('Returns the authenticated user\'s own profile information, including user ID, name, email, department, group, and admin status. No parameters required.');

export const ListUsersSchema = z.object({})
    .describe('List all users. Admin users see all user profiles; non-admin users receive only their own profile. Passwords are always stripped from results.');

export const GetUserSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the user to retrieve. Non-admin users can only retrieve their own profile.'),
});

export const CreateUserSchema = z.object({
    name: z.string().min(1)
        .describe('Full name of the new user.'),
    password: z.string().min(8).optional()
        .describe('Initial password for the new user. Must be at least 8 characters. If omitted, a random password is generated and sent to the user\'s email address. If email delivery fails, the generated password is returned in the response as a fallback.'),
    email: z.string().email()
        .describe('Email address of the new user. Used for password reset notifications and welcome emails.'),
    department: z.string().min(1)
        .describe('Department the user belongs to (e.g. "Engineering", "Sales").'),
    group: z.string().min(1)
        .describe('Group the user belongs to within their department (e.g. "Backend", "Frontend").'),
    isAdmin: z.boolean()
        .describe('Whether the new user should have administrator privileges. Admins can manage all users, structures, and database operations.'),
});

export const UpdateUserSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the user to update. Non-admin users can only update their own profile.'),
    name: z.string().optional()
        .describe('New display name for the user.'),
    email: z.string().optional()
        .describe('New email address for the user.'),
    department: z.string().optional()
        .describe('New department for the user.'),
    group: z.string().optional()
        .describe('New group for the user.'),
    isAdmin: z.boolean().optional()
        .describe('New admin status. Only admins can change this field. Changing a user to admin grants full system management privileges.'),
});

export const DeleteUserSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the user to delete. Admin only. This action is irreversible — all documents owned by the user remain in the database but are no longer associated with an active account.'),
});

export const AdminResetPasswordSchema = z.object({
    id: z.string().min(1)
        .describe('The unique ID of the user whose password should be reset. Admin only. A new random password is generated, the user\'s old password is replaced, and the new password is sent to the user\'s email. If email delivery fails, the new password is returned in the response as a fallback.'),
});

export const ForgotPasswordSchema = z.object({
    email: z.string().email()
        .describe('The email address of the user requesting a password reset. A reset link is sent to this address if an account exists. Always returns a generic success message to prevent email enumeration — the response does not reveal whether the email is registered.'),
});

export const ResetPasswordSchema = z.object({
    token: z.string().min(1)
        .describe('The password reset token received via email from the forgot_password tool. Tokens are single-use and expire after a limited time.'),
    password: z.string().min(8)
        .describe('The new password to set. Must be at least 8 characters long.'),
});

export const ExportDatabaseSchema = z.object({
    scope: z.enum(['all', 'users', 'documents', 'structures'])
        .default('all')
        .describe('Which data to export: "all" exports the entire database (users, documents, and structures); "users" exports only user records; "documents" exports only document records; "structures" exports only structure records. Only JSON format is supported via MCP — use the REST API for ZIP export.'),
});

export const ImportDatabaseSchema = z.object({
    data: z.string().min(1)
        .describe('A JSON string containing the data to import. When scope is "all", this must be an object with keys "users", "documents", and/or "structures", each containing an array of records. When scope is "users", "documents", or "structures", this can be either an array of records or an object with a single key matching the scope name. All records should follow the same schema as the data returned by export_database. Example for scope "all": \'{"users": [...], "documents": [...], "structures": [...]}\''),
    scope: z.enum(['all', 'users', 'documents', 'structures'])
        .default('all')
        .describe('Which collection(s) to import data into: "all" imports data from all collections present in the data object; "users" imports only the users array; "documents" imports only the documents array; "structures" imports only the structures array.'),
    mode: z.enum(['replace', 'add', 'skip'])
        .default('replace')
        .describe('How to handle existing records with the same ID: "replace" overwrites existing records with the imported data; "add" always creates new records and assigns new IDs, keeping existing records intact (cross-references like document.owner are rewritten to the new IDs); "skip" only inserts records whose ID does not already exist in the database, leaving existing records unchanged.'),
});

export const CheckVersionSchema = z.object({})
    .describe('Check whether a newer version of docPouch is available. Returns the current installed version, the latest available version from the remote repository, and a boolean indicating whether an update is available. This is a public endpoint — no authentication required. The update check is performed periodically in the background; this tool returns the most recently cached result. If no check has been performed yet (e.g., on first startup), an error is returned.');