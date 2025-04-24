import yup, {object, ObjectSchema, string} from 'yup';

export default class SchemaValidator {
    userCreationSchema

    constructor() {
        this.userCreationSchema = object({
            name: string().required(),
            password: string().required(),
            email: string().optional(),
            roles: yup.array().min(1).required()
        });
    }

    validate(template: "userCreation" | "docCreation" , userInput:object){
        if (template === "docCreation") {
            let res = this.userCreationSchema.validateSync(userInput);
            console.log("Validation Result", res);
        }

    }
}