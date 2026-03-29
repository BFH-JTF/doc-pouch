import {boolean, number, object, ObjectSchema, string, array, mixed} from 'yup';
import winston from 'winston';

export default class SchemaValidator {
    userCreationSchema: ObjectSchema<object>;
    userLoginSchema: ObjectSchema<object>;
    userUpdateSchema: ObjectSchema<object>;
    documentCreationSchema: ObjectSchema<object>;
    documentUpdateSchema: ObjectSchema<object>;
    typeCreationSchema: ObjectSchema<object>;
    structureCreationSchema: ObjectSchema<object>;
    structureUpdateSchema: ObjectSchema<object>;
    documentFetchSchema: ObjectSchema<object>;
    private logger: winston.Logger;

    constructor(logger: winston.Logger) {
        this.logger = logger;

        this.userCreationSchema = object({
            name: string().required(),
            password: string().required(),
            email: string().optional(),
            department: string().required(),
            group: string().required(),
            isAdmin: boolean().required(),
        });

        this.userLoginSchema = object({
            name: string().required(),
            password: string().required(),
        });

        this.userUpdateSchema = object({
            name: string().optional(),
            password: string().optional(),
            email: string().optional(),
            department: string().optional(),
            group: string().optional(),
            isAdmin: boolean().optional(),
        });

        this.documentCreationSchema = object({
            type: number().required(),
            subType: number().required(),
            title: string().required(),
            description: string().optional(),
            shareWithGroup: boolean().required(),
            shareWithDepartment: boolean().required(),
            public: boolean().required(),
            content: mixed()
                .test(
                    'is-array-or-object',
                    'Content must be either an array or an object',
                    (value) => {
                        return Array.isArray(value) || (typeof value === 'object' && value !== null);
                    }
                )
                .required()
        });

        this.documentUpdateSchema = object({
            owner: string().optional(),
            type: number().optional(),
            subType: number().optional(),
            title: string().optional(),
            description: string().optional(),
            shareWithGroup: boolean().optional(),
            shareWithDepartment: boolean().optional(),
            public: boolean().optional(),
            content: mixed()
                .test(
                    'is-array-or-object',
                    'Content must be either an array or an object',
                    (value) => {
                        return Array.isArray(value) || (typeof value === 'object' && value !== null);
                    }
                )
                .required()
        });

        this.structureCreationSchema = object({
            name: string().required(),
            fields: array().required(),
        });

        this.structureUpdateSchema = object({
            name: string().optional(),
            description: string().optional(),
            type: number().optional(),
            subType: number().optional(),
            fields: array().optional(),
        });

        this.documentFetchSchema = object({
            _id: number().optional(),
            title: string().optional(),
            type: number().optional(),
            subType: number().optional(),
            shareWithGroup: boolean().optional(),
            shareWithDepartment: boolean().optional(),
            public: boolean().optional(),
        })

        this.typeCreationSchema = object({
            _id: string().optional(),

            // If there's NO _id → these become required. If _id IS present → optional.
            name: string().when('_id', {
                is: (v: unknown) => !v,
                then: (s) => s.required('name is required when _id is not provided'),
                otherwise: (s) => s.optional(),
            }),

            description: string().optional(),

            type: number().when('_id', {
                is: (v: unknown) => !v,
                then: (s) => s.required('type is required when _id is not provided'),
                otherwise: (s) => s.optional(),
            }),

            subType: number().when('_id', {
                is: (v: unknown) => !v,
                then: (s) => s.required('subType is required when _id is not provided'),
                otherwise: (s) => s.optional(),
            }),

            defaultStructureID: string().optional(),
        })
            // If _id exists, require at least ONE of the other fields to be provided (non-empty).
            .test(
                'id-mode-has-something',
                'When _id is provided, at least one of name, description, type, subType, defaultStructureID must be provided.',
                (value) => {
                    if (!value || !value._id) return true; // rule only applies when _id is present

                    const keys = ['name', 'description', 'type', 'subType', 'defaultStructureID'] as const;

                    return keys.some((k) => {
                        const v = (value as any)[k];
                        if (v === undefined || v === null) return false;
                        // strings must be non-empty after trim; numbers/others just need to be defined
                        if (typeof v === 'string') return v.trim().length > 0;
                        return true;
                    });
                }
            );


        this.logger.debug('SchemaValidator initialized with schemas');
    }

    getValidatedObject(template: string, userInput: object): object | false {
    try {
        let res: object;
        switch (template) {
            case "userCreation":
                res = this.userCreationSchema.validateSync(userInput, { abortEarly: false, stripUnknown: true });
                break;
            case "userLogin":
                res = this.userLoginSchema.validateSync(userInput, { abortEarly: false, stripUnknown: true });
                break;
            case "userUpdate":
                res = this.userUpdateSchema.validateSync(userInput, { abortEarly: false, stripUnknown: true });
                break;
            case "documentCreation":
                res = this.documentCreationSchema.validateSync(userInput, { abortEarly: false, stripUnknown: true });
                break;
            case "documentUpdate":
                res = this.documentUpdateSchema.validateSync(userInput, { abortEarly: false, stripUnknown: true });
                break;
            case "documentFetch":
                res = this.documentFetchSchema.validateSync(userInput, { abortEarly: false, stripUnknown: true });
                break;
            case "structureCreation":
                res = this.structureCreationSchema.validateSync(userInput, { abortEarly: false, stripUnknown: true });
                break;
            case "structureUpdate":
                res = this.structureUpdateSchema.validateSync(userInput, { abortEarly: false, stripUnknown: true });
                break;
            case "typeCreation":
                res = this.typeCreationSchema.validateSync(userInput, {abortEarly: false, stripUnknown: true});
                break;
            default:
                const errorMsg = `Unknown schema template: ${template}`;
                this.logger.error(errorMsg);
                return false;
        }

        this.logger.debug(`Validation successful for schema: ${template}`);

        return res;
    }
    catch (error: any) {
        this.logger.error(`Validation error for schema: ${template}`, { 
            error: error.message,
            errors: error.errors,
            inputFields: Object.keys(userInput)
        });

        return false;
    }
}
}
