import Datastore from 'nedb';
import winston from "winston";
import fs from "fs";

import type {
    I_UserEntry,
    I_DocumentEntry,
    I_StructureEntry,
    I_UserCreation,
    I_DocumentCreation, I_StructureCreation, I_DocumentCreationOwned
} from "./vue/types.js";

export default class NeDbWrapper {
    users: CustomStore
    structures: CustomStore
    documents: CustomStore
    logger: winston.Logger

    constructor(winstonLogger: winston.Logger) {
        this.logger = winstonLogger;
        const dbPath = "./db"
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath);
        }

        this.users = new CustomStore("./db/docpouch-users.db",
            "System Users", "Collection of documents describing system users - handle with care")
        this.users.datastore.persistence.setAutocompactionInterval(1000 * 60 * 5);
        this.structures = new CustomStore("./db/docpouch-structures.db",
            "Data Structures", "Collection of documents describing data structures")
        this.structures.datastore.persistence.setAutocompactionInterval(1000 * 60 * 30);
        this.documents = new CustomStore("./db/docpouch-documents.db",
            "User Documents", "Collection of user documents")
        this.documents.datastore.persistence.setAutocompactionInterval(1000 * 60 * 60);

        this.users.count({}).then((counter) => {
            // No users in database yet?
            if (counter < 1) {
                // Create default admin
                let defaultAdminUser: I_UserCreation = {
                    password: "adminSecret",
                    name: "admin",
                    isAdmin: true,
                }

                this.users.add(defaultAdminUser).then((user) => {
                    this.logger.info(`Created new admin account: ${JSON.stringify(user)}`);
                });

                this.documents.count({}).then((counter) => {
                    // No documents in database yet?
                    if (counter < 1) {
                        // Create demo document
                        this.getAdminUser().then((admin) => {
                            if (admin._id){
                                let defaultDocument: I_DocumentCreationOwned = {
                                    title: "Demo Document",
                                    owner: admin._id,
                                    description: "This is just a demo, delete when you don't need it anymore",
                                    subType: 0,
                                    type: 1,
                                    content: [{
                                        label: "This is a demo document not following any document structure",
                                        importance: 0
                                    }]
                                }

                                this.documents.add(defaultDocument).then((document) => {
                                    this.logger.info(`Created new document: ${JSON.stringify(defaultDocument)}`);
                                });

                                this.structures.count({}).then((counter) => {
                                    // No structures in database yet?
                                    if (counter < 1) {
                                        // Create demo structure
                                        this.getAdminUser().then((admin) => {
                                            if (admin._id){
                                                let defaultStructure: I_StructureEntry = {
                                                    _id: "tt5vo04DN3jm8Bqe",
                                                    description: "This is a demo structure.",
                                                    name: "City Info",
                                                    fields: [
                                                        {
                                                            name: "City name",
                                                            type: "string",
                                                        },
                                                        {
                                                            name: "# of inhabitants",
                                                            type: "number"
                                                        }
                                                    ]
                                                }
                                                this.structures.add(defaultStructure).then((structure) => {
                                                    this.logger.info(`Created new structure: ${JSON.stringify(structure)}`);
                                                });
                                            }
                                        })
                                    }
                                })
                            }
                        })
                    }
                })
            }
        })
    }

    private getAdminUser(): Promise<I_UserEntry> {
        return new Promise((resolve, reject) => {
            this.users.query({isAdmin: true}).then((result) => {
                if (result.length > 0)
                    resolve(result[0] as I_UserEntry);
                else
                    reject("No admin user found");
            })
        })
    }

    getUsers(requestingUserID?: string): Promise<I_UserEntry[]>{
        return new Promise((resolve, reject) => {
            if (requestingUserID !== undefined) {
                this.isAdmin(requestingUserID).then((isAdmin) => {
                    if (isAdmin) {
                        // Admin can see all users
                        this.users.query({}).then((result) => { 
                            resolve(result as I_UserEntry[]);
                        });
                    } else {
                        // Normal user can only see themselves
                        this.users.query({_id: requestingUserID}).then((result) => { 
                            resolve(result as I_UserEntry[]);
                        });
                    }
                });
            } else {
                // Backward compatibility for calls without user ID
                this.users.query({}).then((result) => { 
                    resolve(result as I_UserEntry[]);
                });
            }
        })
    }

    getUserByName(username: string): Promise<I_UserEntry>{
        return new Promise((resolve, reject) => {
            this.users.query({ name: username })
                .then((result) => {
                    if (result.length > 0)
                        resolve(result[0] as I_UserEntry);
                    else
                        reject("User not found");
                })
        })
    }

    createUser(newUser: I_UserCreation): Promise<I_UserEntry> {
        return new Promise((resolve, reject) => {
            if (newUser.password.length < 8)
                reject("Password must be at least 8 characters long");
            if (newUser.name.length < 1)
                reject("User must have a name");
            this.users.count({name: newUser.name})
                .then((count) => {
                if (count > 0)
                    reject("User name already exists");
                else{
                    this.users.query({})
                        .then((allUsers) => {
                            this.users.add({
                                email: newUser.email, name: newUser.name, password: newUser.password, isAdmin: newUser.isAdmin
                            })
                                .then((result) => {
                                    this.logger.info("Created new user account: " + JSON.stringify(newUser));
                                    resolve(result as I_UserEntry);
                                });
                        })

                }
            })
        })
    }

    removeUser(userID: string) {
        return new Promise((resolve, reject) => {
            this.users.remove({_id: userID}).then((numRemoved: number) => {
                if (numRemoved > 0) {
                    this.logger.info("Removed user:" + JSON.stringify(userID));
                    resolve(numRemoved);
                }
                else
                    reject("User not found");
            })
        })
    }

    updateUser(userID: string, updateData: Partial<I_UserEntry>): Promise<number> {
        return new Promise((resolve, reject) => {
            this.users.query({_id: userID}).then((userDoc) => {
                if (userDoc.length > 0) {
                    const user = userDoc[0];
                    if (("isAdmin" in user && user.isAdmin) || !("isAdmin" in updateData)) {
                        if ("name" in updateData && updateData.name) {
                            const newUserName = updateData.name;

                            this.users.count({name: newUserName}).then((count) => {
                                if (count > 0) {
                                    reject(new Error("User with this name already exists"));
                                } else {
                                    if ("_id" in user && user._id) {
                                        this.users.update(user._id, updateData).then((result) => {
                                            resolve(result);
                                        }).catch(reject);
                                    }
                                }
                            }).catch(reject);
                        } else {
                            // No name change, proceed with update
                            if ("_id" in user && user._id) {
                                this.users.update(user._id, updateData).then((result) => {
                                    resolve(result);
                                }).catch(reject);
                            }
                        }

                    } else {
                        reject(new Error("Cannot change admin status"));
                    }
                } else {
                    reject(new Error("User not found"));
                }
            }).catch(reject);
        });
    }

    isAdmin (userID: string) : Promise<boolean> {
        return new Promise((resolve) => {
            this.users.query({_id: userID}).then((user) => {
                if (user.length > 0) {
                    let u = user[0] as I_UserEntry;
                    if (u.isAdmin)
                        resolve(true);
                    else
                        resolve(false);
                } else
                    resolve(false);
            })
        })
    }

    // Structure methods with access control
    getStructures(): Promise<I_StructureEntry[]> {
        return new Promise((resolve, reject) => {
            // Structures are visible to anyone
            this.structures.query({}).then((result) => {
                resolve(result as I_StructureEntry[]);
            }).catch(reject);
        });
    }

    getStructureByID(structureID: number): Promise<I_StructureEntry> {
        return new Promise((resolve, reject) => {
            // Structures are visible to anyone
            this.structures.query({_id: structureID}).then((result) => {
                if (result.length > 0) {
                    resolve(result[0] as I_StructureEntry);
                } else {
                    reject("Structure not found");
                }
            }).catch(reject);
        });
    }

    createStructure(structure: I_StructureCreation, requestingUserID: string): Promise<I_StructureEntry> {
        return new Promise((resolve, reject) => {
            this.isAdmin(requestingUserID).then((isAdmin) => {
                if (!isAdmin) {
                    reject("Only admins can create structures");
                    return;
                }

                this.structures.query({name: structure.name}).then((result) => {
                    if (result.length > 0) {
                        reject("Structure name already exists");
                    } else {
                        this.structures.add(structure).then((result) => {
                            this.logger.info("Created new structure: " + JSON.stringify(result));
                            resolve(result as I_StructureEntry);
                        }).catch(reject);
                    }
                }).catch(reject);
            });
        });
    }

    updateStructure(structureID: number, newStructure: I_StructureEntry, requestingUserID: string) : Promise<number> {
        return new Promise((resolve, reject) => {
            this.isAdmin(requestingUserID).then((isAdmin) => {
                if (!isAdmin) {
                    reject("Only admins can update structures");
                    return;
                }

                this.structures.query({id: structureID}).then((structureDoc) => {
                    if (structureDoc.length > 0) {
                        const structure = structureDoc[0];
                        if ("_id" in structure && typeof structure._id === "string") {
                            this.structures.update(structure._id, newStructure).then((result) => {
                                resolve(result);
                            }).catch(reject);
                        } else {
                            reject(new Error("Structure ID is not a string"));
                        }
                    } else {
                        reject("Structure not found");
                    }
                }).catch(reject);
            });
        });
    }

    removeStructure(structureID: number, requestingUserID: string) : Promise<number> {
        return new Promise((resolve, reject) => {
            this.isAdmin(requestingUserID).then((isAdmin) => {
                if (!isAdmin) {
                    reject("Only admins can remove structures");
                    return;
                }

                this.structures.remove({id: structureID}).then((numRemoved: number) => {
                    if (numRemoved > 0) {
                        this.logger.info("Removed structure:" + JSON.stringify(structureID));
                        resolve(numRemoved);
                    }
                    else {
                        reject("Structure not found");
                    }
                })
            });
        })
    }

    getUserByID(id: string): Promise<I_UserEntry> {
        return new Promise((resolve, reject) => {
            this.users.query({_id: id})
                .then((result) => {
                    if (result.length > 0)
                        resolve(result[0] as I_UserEntry);
                    else
                        reject("User not found");
                })
        })
    }

    // Document methods with access control
    getDocuments(requestingUserID: string): Promise<I_DocumentEntry[]> {
        return new Promise((resolve, reject) => {
            this.isAdmin(requestingUserID).then((isAdmin) => {
                if (isAdmin) {
                    // Admin can see all documents
                    this.documents.query({}).then((result) => {
                        resolve(result as I_DocumentEntry[]);
                    });
                } else {
                    // Normal user can only see their own documents
                    this.documents.query({owner: requestingUserID}).then((result) => {
                        resolve(result as I_DocumentEntry[]);
                    });
                }
            });
        });
    }

    getDocumentByID(documentID: string, requestingUserID: string): Promise<I_DocumentEntry> {
        return new Promise((resolve, reject) => {
            this.documents.query({_id: documentID}).then((result) => {
                if (result.length === 0) {
                    reject("Document not found");
                    return;
                }

                const document = result[0] as I_DocumentEntry;

                this.isAdmin(requestingUserID).then((isAdmin) => {
                    if (isAdmin || document.owner === requestingUserID) {
                        resolve(document);
                    } else {
                        reject("Not authorized to access this document");
                    }
                });
            });
        });
    }

    createDocument(document: I_DocumentEntry, requestingUserID: string): Promise<I_DocumentEntry> {
        return new Promise((resolve, reject) => {
            // Set the owner to the requesting user
            document.owner = requestingUserID;

            this.documents.add(document).then((newDocument) => {
                this.logger.info("Created new document: " + JSON.stringify(newDocument));
                resolve(newDocument as I_DocumentEntry);
            }).catch(reject);
        });
    }

    updateDocument(documentID: string, updateData: Partial<I_DocumentEntry>, requestingUserID: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.documents.query({_id: documentID}).then((result) => {
                if (result.length === 0) {
                    reject("Document not found");
                    return;
                }

                const document = result[0] as I_DocumentEntry;

                this.isAdmin(requestingUserID).then((isAdmin) => {
                    if (isAdmin || document.owner === requestingUserID) {
                        // Don't allow changing the owner
                        if (updateData.owner !== undefined && updateData.owner !== document.owner) {
                            reject("Cannot change document owner");
                            return;
                        }

                        this.documents.update(documentID, updateData).then((numUpdated) => {
                            resolve(numUpdated);
                        }).catch(reject);
                    } else {
                        reject("Not authorized to update this document");
                    }
                });
            });
        });
    }

    removeDocument(documentID: string, requestingUserID: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.documents.query({_id: documentID}).then((result) => {
                if (result.length === 0) {
                    reject("Document not found");
                    return;
                }

                const document = result[0] as I_DocumentEntry;

                this.isAdmin(requestingUserID).then((isAdmin) => {
                    if (isAdmin || document.owner === requestingUserID) {
                        this.documents.remove({_id: documentID}).then((numRemoved) => {
                            if (numRemoved > 0) {
                                this.logger.info("Removed document: " + JSON.stringify(documentID));
                                resolve(numRemoved);
                            } else {
                                reject("Document not found");
                            }
                        });
                    } else {
                        reject("Not authorized to remove this document");
                    }
                });
            });
        });
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
                    reject(err);
                } else {
                    resolve(count);
                }
            });
        });
    }

    async add(inputData: I_DocumentCreationOwned | I_UserCreation | I_StructureCreation): Promise<I_DocumentEntry | I_UserEntry | I_StructureEntry> {
        return new Promise((resolve, reject) => {
            this.datastore.insert(inputData, (err: Error | null, newDocument: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(newDocument as I_DocumentEntry | I_UserEntry | I_StructureEntry);
                }
            });
        });
    }

    async query(query: object): Promise<I_DocumentEntry[] | I_UserEntry[] | I_StructureEntry[]> {
        return new Promise((resolve, reject) => {
            this.datastore.find(query, (err: any, newDocument: I_DocumentEntry[] | I_UserEntry[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(newDocument);
                }
            });
        });
    }

    async remove(query: object): Promise<number> {
        return new Promise((resolve, reject) => {
            this.datastore.remove(query, {}, (err: any, numRemoved: number) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(numRemoved);
                }
            });
        });
    }

    async update(documentID: string, updateInfo: object): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!("owner" in updateInfo)) {
                this.datastore.update({_id: documentID}, {$set: updateInfo}, {}, (err: any, numReplaced: number) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(numReplaced);
                    }
                });
            }
            else
                reject("Cannot update owner field");
        });
    }
}