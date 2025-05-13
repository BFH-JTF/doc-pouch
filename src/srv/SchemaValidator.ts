import {boolean, number, object, ObjectSchema, string, array} from 'yup';
import winston from 'winston';

export default class SchemaValidator {
    userCreationSchema: ObjectSchema<object>;
    userLoginSchema: ObjectSchema<object>;
    userUpdateSchema: ObjectSchema<object>;
    documentCreationSchema: ObjectSchema<object>;
    documentUpdateSchema: ObjectSchema<object>;
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
            isAdmin: boolean().optional(),
        });

        this.documentCreationSchema = object({
            type: number().required(),
            subType: number().required(),
            title: string().required(),
            description: string().required(),
            content: string().required(),
        });

        this.documentUpdateSchema = object({
            type: number().optional(),
            subType: number().optional(),
            title: string().optional(),
            description: string().optional(),
            content: string().optional(),
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
        })

        this.logger.debug('SchemaValidator initialized with schemas');
    }

validate(template: string, userInput: object): boolean {
    try {
        let res;
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
            default:
                const errorMsg = `Unknown schema template: ${template}`;
                this.logger.error(errorMsg);
                return false;
        }

        this.logger.debug(`Validation successful for schema: ${template}`, { 
            castedFields: Object.keys(res) 
        });

        return true;
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
