import Datastore from 'nedb';

export default class NeDbWrapper {
    users: CustomStore

    constructor() {

        // Open collections for system users and system roles
        this.users = new CustomStore("system-users.json",
            "System Users", "Collection of documents describing system users - handle with care", [0],[0])

        this.users.count({}).then((counter) => {
            // New DB?
            if (counter < 1) {
                // Create default admin
                let defaultAdminUser: I_dbUser = {
                    password: "adminSecret", roleIds: [0],
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

    getUsersByIds(ids: number[]): Promise<I_dbUser[]>{
        return new Promise((resolve, reject) => {
            this.users.query({ id: { $in: ids } }).then((result) => { resolve(result); });
        })
    }

    createUser(user: I_dbUser) {
        return new Promise((resolve, reject) => {
            if (user.password.length < 8)
                reject("Password must be at least 8 characters long");
            if (user.name.length < 1)
                reject("User must have a name");
            if (user.roleIds.length < 1)
                reject("User must have at least 1 role");
            let userIds = this.getUsers()
            this.users.add({ user }).then((result) => { resolve(result); });
        })
    }
}

class CustomStore {
    datastore: Datastore;
    name: string;
    description: string;
    readingRoleIds: number[];
    writingRoleIds: number[];

    constructor(filename: string, name: string, description: string, readingRoleIds: number[], writingRoleIds: number[]) {
        this.datastore = new Datastore({ filename: filename, autoload: true });
        this.name = name;
        this.description = description;
        this.readingRoleIds = readingRoleIds;
        this.writingRoleIds = writingRoleIds;
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
    roleIds: number[];
}

export interface I_dbUserRole {
    id: number;
    name: string;
    description: string;
    seeAll: boolean;
}

export interface I_Document {
    documentType: number;

}