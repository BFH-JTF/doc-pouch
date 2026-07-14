import {z} from 'zod';

export const ListDocumentsSchema = z.object({
    query: z.object({
        type: z.number().optional(),
        subType: z.number().optional(),
        owner: z.string().optional(),
        public: z.boolean().optional(),
        shareWithGroup: z.boolean().optional(),
        shareWithDepartment: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).default(100),
    }).optional().default({limit: 100}),
});

export const GetDocumentSchema = z.object({
    id: z.string().min(1),
});

export const CreateDocumentSchema = z.object({
    type: z.number(),
    subType: z.number(),
    title: z.string().min(1),
    description: z.string().optional(),
    content: z.any(),
    public: z.boolean(),
    shareWithGroup: z.boolean(),
    shareWithDepartment: z.boolean(),
    anonymous: z.boolean().optional().default(false),
});

export const UpdateDocumentSchema = z.object({
    id: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    content: z.any().optional(),
    public: z.boolean().optional(),
    shareWithGroup: z.boolean().optional(),
    shareWithDepartment: z.boolean().optional(),
});

export const DeleteDocumentSchema = z.object({
    id: z.string().min(1),
});

export const ListStructuresSchema = z.object({});

export const GetStructureSchema = z.object({
    id: z.string().min(1),
});

export const CreateStructureSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.number(),
    subType: z.number(),
    fields: z.array(z.object({
        name: z.string().min(1),
        displayName: z.string().optional(),
        type: z.string().min(1),
        items: z.string().optional(),
    })).min(1),
});

export const UpdateStructureSchema = z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    type: z.number(),
    subType: z.number(),
    fields: z.array(z.object({
        name: z.string().min(1),
        displayName: z.string().optional(),
        type: z.string().min(1),
        items: z.string().optional(),
    })).optional(),
});

export const DeleteStructureSchema = z.object({
    id: z.string().min(1),
});

export const WhoamiSchema = z.object({});

export const ListUsersSchema = z.object({});

export const GetUserSchema = z.object({
    id: z.string().min(1),
});

export const CreateUserSchema = z.object({
    name: z.string().min(1),
    password: z.string().min(8).optional(),
    email: z.string().email(),
    department: z.string().min(1),
    group: z.string().min(1),
    isAdmin: z.boolean(),
});

export const UpdateUserSchema = z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    email: z.string().optional(),
    department: z.string().optional(),
    group: z.string().optional(),
    isAdmin: z.boolean().optional(),
});

export const DeleteUserSchema = z.object({
    id: z.string().min(1),
});

export const AdminResetPasswordSchema = z.object({
    id: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
    email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(8),
});