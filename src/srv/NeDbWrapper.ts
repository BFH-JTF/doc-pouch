import Datastore from 'nedb';
import winston from "winston";

export default class NeDbWrapper {
    users: CustomStore
    logger: winston.Logger

    constructor(winstonLogger: winston.Logger) {
        this.logger = winstonLogger;
        this.users = new CustomStore("system-users.json",
            "System Users", "Collection of documents describing system users - handle with care", [0],[0])

        this.users.count({}).then((counter) => {
            // New DB?
            if (counter < 1) {
                // Create default admin
                let defaultAdminUser: I_dbUser = {
                    password: "adminSecret",
                    id: 0,
                    name: "admin"
                }

                this.users.add(defaultAdminUser).then((user) => {
                    console.info("Created default admin account:", user);
                });
            }
        })
    }

    getUsers(): Promise<I_dbUser[]>{
        return new Promise((resolve, reject) => {
            this.users.query({}).then((result) => { resolve(result); });
        })
    }

    getUserByName(username: string): Promise<I_dbUser>{
        return new Promise((resolve, reject) => {
            this.users.query({ name: username })
                .then((result) => { resolve(result); });
        })
    }

    createUser(user: I_dbUser) {
        return new Promise((resolve, reject) => {
            if (user.password.length < 8)
                reject("Password must be at least 8 characters long");
            if (user.name.length < 1)
                reject("User must have a name");
            this.users.count({name: user.name})
                .then((count) => {
                if (count > 0)
                    reject("User name already exists");
                else{
                    this.users.add({ user })
                        .then((result) => {
                            resolve(result);
                        });
                }
            })
        })
    }
}

class CustomStore {
    datastore: Datastore;
    name: string;
    description: string;

    constructor(filename: string, name: string, description: string) {
        this.datastore = new Datastore({ filename: filename, autoload: true });
        this.name = name;
        this.description = description;
    }

    async count(query: object): Promise<number> {
        return new Promise((resolve, reject) => {
            this.datastore.count(query, (err: any, count: number) => {
                if (err) {
                    reject(err); // Reject the promise if there's an error
                } else {
                    resolve(count); // Resolve the promise with the count
                }
            });
        });
    }

    async add(document: object): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.insert(document, (err: any, newDocument: object) => {
                if (err) {
                    reject(err); // Reject the promise if there's an error
                } else {
                    resolve(newDocument); // Resolve the promise with the count
                }
            });
        });
    }

    async query(query: object): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.find(query, (err: any, newDocument: object) => {
                if (err) {
                    reject(err); // Reject the promise if there's an error
                } else {
                    resolve(newDocument); // Resolve the promise with the count
                }
            });
        });
    }
}

export interface I_dbUser {
    id?: number;
    name: string;
    email?: string;
    password: string;
}

export interface I_Document {
    documentType: number;

}