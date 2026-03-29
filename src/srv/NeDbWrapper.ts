import Nedb from "@seald-io/nedb";
import winston from "winston";
import fs from "fs";
import bcrypt from "bcrypt"
import type {
    I_UserEntry,
    I_DocumentEntry,
    I_StructureEntry,
    I_UserCreation,
    I_DocumentCreation, I_StructureCreation, I_DocumentCreationOwned, I_DocumentQuery, I_DocumentType, I_DocumentUpdate
} from "docpouch-client";

// Type declaration to help TypeScript understand Nedb constructor
declare const NedbConstructor: new (options?: any) => any;
type NedbInstance = InstanceType<typeof NedbConstructor>;

export interface INeDbOptions {
    inMemoryOnly?: boolean;
    filenamePrefix?: string;
    dbPath?: string;
}

export default class NeDbWrapper {
    users: CustomStore
    structures: CustomStore
    documents: CustomStore
    types: CustomStore
    logger: winston.Logger
    saltRounds: number = 10;
    private readonly inMemoryOnly: boolean;
    private readonly filenamePrefix: string | undefined;
    private readonly dbPath: string | undefined;

    constructor(winstonLogger: winston.Logger, options: INeDbOptions = {}) {
        this.logger = winstonLogger;
        this.inMemoryOnly = options.inMemoryOnly ?? false;
        this.filenamePrefix = options.filenamePrefix ?? undefined;
        this.dbPath = options.dbPath ?? "./db";
        if (!fs.existsSync(this.dbPath)) {
            fs.mkdirSync(this.dbPath);
        }
        if (options.inMemoryOnly) {
            this.logger.info("Using in-memory database");
            this.users = new CustomStore(undefined,
                "System Users", "Collection of documents describing system users - handle with care")
            this.users.datastore.setAutocompactionInterval(1000 * 60 * 5);
            this.structures = new CustomStore(undefined,
                "Data Structures", "Collection of documents describing data structures")
            this.structures.datastore.setAutocompactionInterval(1000 * 60 * 30);
            this.documents = new CustomStore(undefined,
                "User Documents", "Collection of user documents")
            this.documents.datastore.setAutocompactionInterval(1000 * 60 * 60);
            this.types = new CustomStore(undefined,
                "Document Types", "Collection of document types")
            this.types.datastore.setAutocompactionInterval(1000 * 60 * 60);
        } else {
            this.logger.info("Using database files in " + this.dbPath);
            if (this.filenamePrefix === undefined)
                this.filenamePrefix = "docpouch-"
            this.logger.info(`Using database files in ${this.dbPath}/${this.filenamePrefix}users.db, ${this.dbPath}/${this.filenamePrefix}structures.db, ${this.dbPath}/${this.filenamePrefix}documents.db, ${this.dbPath}/${this.filenamePrefix}types.db`)
            this.users = new CustomStore(`${this.dbPath}/${this.filenamePrefix}users.db`,
                "System Users", "Collection of documents describing system users - handle with care")
            this.users.datastore.setAutocompactionInterval(1000 * 60 * 5);
            this.structures = new CustomStore(`${this.dbPath}/${this.filenamePrefix}structures.db`,
                "Data Structures", "Collection of documents describing data structures")
            this.structures.datastore.setAutocompactionInterval(1000 * 60 * 30);
            this.documents = new CustomStore(`${this.dbPath}/${this.filenamePrefix}documents.db`,
                "User Documents", "Collection of user documents")
            this.documents.datastore.setAutocompactionInterval(1000 * 60 * 60);
            this.types = new CustomStore(`${this.dbPath}/${this.filenamePrefix}types.db`,
                "Document Types", "Collection of document types")
            this.types.datastore.setAutocompactionInterval(1000 * 60 * 60);
        }
        this.types.datastore.setAutocompactionInterval(1000 * 60 * 60);
        this.users.count({}).then((counter) => {
            // No users in database yet?
            if (counter < 1) {
                // Create default admin
                this.createUser({
                    password: "adminSecret",
                    name: "admin",
                    department: "administration",
                    group: "auto-created",
                    isAdmin: true,
                }).then((addedUser) => {
                    this.logger.info(`Created new admin user: ${JSON.stringify(addedUser)}`);
                    this.documents.count({}).then((counter) => {
                        // No documents in database yet?
                        if (counter < 1) {
                            // Create demo document
                            this.getAdminUser().then((admin) => {
                                if (admin._id) {
                                    let defaultDocument: I_DocumentCreationOwned = {
                                        shareWithDepartment: false,
                                        shareWithGroup: false,
                                        title: "Demo Document",
                                        owner: admin._id,
                                        description: "This is just a demo, delete when you don't need it anymore",
                                        subType: 0,
                                        type: 1,
                                        public: false,
                                        content: [{
                                            label: "This is a demo document not following any document structure",
                                            importance: 0
                                        }]
                                    }

                                    this.documents.add(defaultDocument).then((document) => {
                                        this.logger.info(`Created new document: ${JSON.stringify(document)}`);
                                    });

                                    this.structures.count({}).then((counter) => {
                                        // No structures in database yet?
                                        if (counter < 1) {
                                            // Create demo structure
                                            this.getAdminUser().then((admin) => {
                                                if (admin._id) {
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
                })
            }
        })
    }

    isInMemoryOnly(): boolean {
        return this.inMemoryOnly;
    }

    async exportAllData(): Promise<{ users: any[]; documents: any[]; structures: any[]; types: any[] }> {
        const [users, documents, structures, types] = await Promise.all([
            this.users.query({}),
            this.documents.query({}),
            this.structures.query({}),
            this.types.query({})
        ]);

        return {
            users,
            documents,
            structures,
            types
        };
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

    getUsers(requestingUserID?: string): Promise<I_UserEntry[]> {
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
                reject("Requesting user ID is undefined");
            }
        })
    }

    getUsersByGroupName(groupName: string, departmentName: string): Promise<I_UserEntry[]> {
        return new Promise((resolve, reject) => {
            this.users.query({group: groupName, department: departmentName})
                .then((result) => {
                    if (result.length > 0)
                        resolve(result as I_UserEntry[]);
                    else
                        reject("User not found");
                })
        })
    }

    getUsersByDepartmentName(departmentName: string): Promise<I_UserEntry[]> {
        return new Promise((resolve, reject) => {
            this.users.query({department: departmentName})
                .then((result) => {
                    if (result.length > 0)
                        resolve(result as I_UserEntry[]);
                    else
                        reject("User not found");
                })
        })
    }

    listDocAccess(userID: string): Promise<I_DocumentEntry[]> {
        return new Promise(async (resolve, reject) => {
            try {
                const isAdmin = await this.isAdmin(userID);

                if (isAdmin) {
                    const allDocs = await this.documents.query({}) as I_DocumentEntry[];
                    resolve(allDocs);
                    return;
                }

                const user = await this.getUserByID(userID);

                // Step 1: Get all documents
                const allDocs = await this.documents.query({}) as I_DocumentEntry[];

                // Step 2: Get all owners of these documents
                const ownerIDs = [...new Set(allDocs.map(doc => doc.owner))];
                const owners = await Promise.all(
                    ownerIDs.map(ownerID => this.getUserByID(ownerID))
                );

                // Step 3: Create a map from owner ID to their department and group
                const ownerInfoMap = owners.reduce((acc, owner) => {
                    if (owner) {
                        acc[owner._id] = {department: owner.department, group: owner.group};
                    }
                    return acc;
                }, {} as Record<string, { department: string; group: string }>);

                // Step 4: Filter documents based on user's access
                const filteredDocs = allDocs.filter(doc => {
                    // Case 0: Document is public
                    if (doc.public) return true;

                    if (!user) return false;

                    const ownerInfo = ownerInfoMap[doc.owner];

                    // Case 1: User is the owner
                    if (doc.owner === userID) return true;

                    // Case 2: Shared with department and user is in the same department
                    if (doc.shareWithDepartment && ownerInfo?.department === user.department)
                        return true;

                    // Case 3: Shared with group and user is in the same group
                    if (doc.shareWithGroup && ownerInfo?.group === user.group)
                        return true;
                    return false;
                });

                resolve(filteredDocs);
            } catch (error) {
                reject(error);
            }
        });
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
                    else {
                        bcrypt.hash(newUser.password, this.saltRounds).then((hash: string) => {
                            this.users.add({
                                email: newUser.email,
                                department: newUser.department,
                                group: newUser.group,
                                name: newUser.name,
                                password: hash,
                                isAdmin: newUser.isAdmin
                            })
                                .then((result) => {
                                    this.logger.info("Created new user account: " + JSON.stringify(newUser));

                                    resolve(result as I_UserEntry);
                                })
                        })
                    }
                })
        })
    }

    validateUser(username: string, password: string): Promise<I_UserEntry | number> {
        return new Promise((resolve, reject) => {
            this.users.query({name: username}).then((result) => {
                if (result.length > 0) {
                    const user = result[0] as I_UserEntry;
                    bcrypt.compare(password, user.password).then((validated) => {
                        if (validated) {
                            resolve(user);
                        } else {
                            resolve(401);
                        }
                    }).catch(() => {
                        resolve(401);
                    });
                } else {
                    resolve(404);
                }
            }).catch((error) => {
                reject("Database error: " + error);
            });
        });
    }


    removeUser(userID: string) {
        return new Promise((resolve, reject) => {
            this.documents.remove({owner: userID}).then(() => {
                this.users.remove({_id: userID}).then((numRemoved: number) => {
                    if (numRemoved > 0) {
                        this.logger.info("Removed user:" + JSON.stringify(userID));
                        resolve(numRemoved);
                    } else
                        reject("User not found");
                })
            })
        })
    }

    updateUser(userID: string, updateData: Partial<I_UserEntry>): Promise<number> {
        return new Promise((resolve, reject) => {
            this.users.query({_id: userID}).then((userDoc) => {
                if (userDoc.length > 0) {
                    const user = userDoc[0];
                    if (user && ("isAdmin" in user && user.isAdmin) || !("isAdmin" in updateData)) {
                        if ("name" in updateData && updateData.name) {
                            const newUserName = updateData.name;

                            this.users.count({name: newUserName}).then((count) => {
                                if (count > 0) {
                                    reject(new Error("User with this name already exists"));
                                }
                            }).catch(reject);
                        }

                        if ("password" in updateData && updateData.password) {
                            bcrypt.hash(updateData.password, this.saltRounds).then((hash: string) => {
                                updateData.password = hash;
                                this.users.update(userID, updateData).then((result) => {
                                    resolve(result);
                                })
                            })
                        }

                        if (user && "_id" in user && user._id) {
                            this.users.update(user._id, updateData).then((result) => {
                                resolve(result);
                            }).catch(reject);
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

    isAdmin(userID: string): Promise<boolean> {
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

    updateStructure(structureID: string, newStructure: I_StructureEntry, requestingUserID: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.isAdmin(requestingUserID).then((isAdmin) => {
                if (!isAdmin)
                    reject(401);
                else {
                    this.structures.query({_id: structureID}).then((structureDoc) => {
                        if (structureDoc.length > 0) {
                            const structure = structureDoc[0];
                            if (structure && "_id" in structure && typeof structure._id === "string") {
                                this.structures.update(structure._id, newStructure).then((result) => {
                                    resolve(result);
                                }).catch(() => {
                                    reject(400);
                                });
                            } else {
                                reject(400);
                            }
                        } else {
                            reject(404);
                        }
                    }).catch(() => {
                        reject(400)
                    });
                }
            });
        });
    }

    removeStructure(structureID: string, requestingUserID: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.isAdmin(requestingUserID).then((isAdmin) => {
                if (!isAdmin) {
                    reject(401);
                    return;
                }

                this.structures.remove({_id: structureID}).then((numRemoved: number) => {
                    if (numRemoved > 0) {
                        this.logger.info("Removed structure:" + JSON.stringify(structureID));
                        resolve(numRemoved);
                    } else {
                        reject(404);
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

    getAllDocuments(requestingUserID: string): Promise<I_DocumentEntry[]> {
        return this.listDocAccess(requestingUserID);
    }

    fetchDocuments(queryObject: I_DocumentQuery, requestingUserID: string): Promise<I_DocumentEntry[]> {
        return new Promise(async (resolve, reject) => {
            try {
                const accessibleDocs = await this.listDocAccess(requestingUserID);

                const matchingDocs = accessibleDocs.filter(doc => {
                    return Object.entries(queryObject).every(([key, value]) => {
                        if (value === undefined || value === null)
                            return true;

                        if (!(key in doc))
                            return false;

                        if (key === '_id')
                            return doc._id === value.toString();

                        // For string values, allow case-insensitive comparison if both are strings
                        if (typeof value === 'string' && typeof doc[key as keyof I_DocumentEntry] === 'string') {
                            return (doc[key as keyof I_DocumentEntry] as string).toLowerCase() === value.toLowerCase();
                        }

                        // For numbers, allow string/number conversion
                        if ((typeof value === 'number' || typeof doc[key as keyof I_DocumentEntry] === 'number') &&
                            !isNaN(Number(value)) && !isNaN(Number(doc[key as keyof I_DocumentEntry]))) {
                            return Number(doc[key as keyof I_DocumentEntry]) === Number(value);
                        }

                        // Default to strict equality
                        return doc[key as keyof I_DocumentEntry] === value;
                    });
                });

                // Return empty array instead of rejecting when no docs found
                if (matchingDocs.length === 0) {
                    return resolve([]);
                }
                resolve(matchingDocs);
            } catch (error) {
                reject(error);
            }
        });
    }

    createDocument(document: I_DocumentCreation, requestingUserID: string): Promise<I_DocumentEntry> {
        return new Promise((resolve, reject) => {
            // Set the owner to the requesting user
            let newDocument: I_DocumentCreationOwned = {
                content: document.content,
                description: document.description,
                owner: requestingUserID,
                subType: document.subType,
                title: document.title,
                type: document.type,
                shareWithGroup: document.shareWithGroup,
                shareWithDepartment: document.shareWithDepartment,
                public: document.public
            }

            this.documents.add(newDocument).then((savedDocument) => {
                this.logger.info("Created new document: " + JSON.stringify(savedDocument));
                resolve(savedDocument as I_DocumentEntry);
            }).catch(reject);
        });
    }

    updateDocument(documentID: string, updateData: I_DocumentUpdate, requestingUserID: string): Promise<number> {
        return new Promise(async (resolve, reject) => {
            try {
                // First, get all documents the user has access to
                const accessibleDocs = await this.listDocAccess(requestingUserID);

                // Find the specific document
                const document = accessibleDocs.find(doc => doc._id === documentID);

                if (!document) {
                    reject(404);
                    return;
                }

                const isAdmin = await this.isAdmin(requestingUserID);

                // Don't allow changing the owner
                if (updateData.owner !== undefined && updateData.owner !== document.owner) {
                    reject(400);
                    return;
                }

                // Check update permissions based on user's relationship to the document
                if (isAdmin || document.owner === requestingUserID) {
                    // Admin or owner can update all fields except owner
                    delete updateData.owner;
                    this.documents.update(documentID, updateData).then((numUpdated) => {
                        resolve(numUpdated);
                    }).catch(reject);
                } else {
                    // Users with shared access can only update content
                    const allowedUpdates: Partial<I_DocumentEntry> = {};

                    // Only allow updating content
                    if (updateData.content !== undefined) {
                        allowedUpdates.content = updateData.content;
                    }

                    if (Object.keys(allowedUpdates).length > 0) {
                        this.documents.update(documentID, allowedUpdates).then((numUpdated) => {
                            resolve(numUpdated);
                        }).catch(reject);
                    } else {
                        reject(400);
                    }
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    removeDocument(documentID: string, requestingUserID: string): Promise<number> {
        return new Promise(async (resolve, reject) => {
            try {
                // Find the specific document
                this.documents.query({_id: documentID}).then((result) => {
                    if (result.length !== 1) {
                        reject(404);
                        return;
                    }
                    let document = result[0] as I_DocumentEntry;
                    this.isAdmin(requestingUserID).then((isAdmin) => {
                        if (isAdmin || document.owner === requestingUserID) {
                            this.documents.remove({_id: documentID}).then((numRemoved) => {
                                if (numRemoved > 0) {
                                    this.logger.info("Removed document: " + JSON.stringify(documentID));
                                    resolve(numRemoved);
                                } else {
                                    reject(404);
                                }
                            }).catch(reject);
                        } else {
                            reject(401);
                        }
                    });
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    getDocumentTypes(): Promise<I_DocumentType[]> {
        return new Promise((resolve, reject) => {
            this.types.query({}).then((result) => {
                resolve(result as I_DocumentType[]);
            }).catch(reject);
        });
    }

    writeDocumentType(newTypeData: I_DocumentType, requestingUserID: string): Promise<I_DocumentType> {
        return new Promise((resolve, reject) => {
            this.isAdmin(requestingUserID).then(isAdmin => {
                if (isAdmin) {
                    this.types.query({type: newTypeData.type, subType: newTypeData.subType}).then(() => {
                        if (newTypeData._id === undefined) {
                            // new entry
                            this.types.add(newTypeData).then((newDocument) => {
                                this.logger.info("Created new document type: " + JSON.stringify(newDocument));
                                resolve(newDocument as I_DocumentType);
                            }).catch(reject);
                        } else {
                            // No duplicate found, or it's the same document, proceed to update
                            this.types.update(newTypeData._id, newTypeData).then(() => {
                                this.logger.info("Updated document type: " + newTypeData._id);
                                resolve(newTypeData);
                            }).catch(reject);
                        }
                    })
                } else
                    reject(401)
            })

        });
    }

    removeDocumentType(documentTypeID: string, requestingUserID: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.isAdmin(requestingUserID).then((isAdmin) => {
                if (isAdmin) {
                    this.types.remove({_id: documentTypeID}).then((numRemoved) => {
                        if (numRemoved > 0) {
                            this.logger.info("Removed document type: " + JSON.stringify(documentTypeID));
                            resolve(numRemoved);
                        } else {
                            reject(404);
                        }
                    });
                } else {
                    reject(401);
                }
            });
        });
    }
}

class CustomStore {
    datastore: NedbInstance;
    name: string;
    description: string;

    constructor(filename: string | undefined, name: string, description: string) {
        if (!filename)
            this.datastore = new (Nedb as any)({inMemoryOnly: true, autoload: true});
        else
            this.datastore = new (Nedb as any)({filename: filename, autoload: true});
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

    async add(inputData: I_DocumentCreationOwned | I_UserCreation | I_StructureCreation | I_DocumentType): Promise<I_DocumentEntry | I_UserEntry | I_StructureEntry | I_DocumentType> {
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

    async query(query: object): Promise<I_DocumentEntry[] | I_UserEntry[] | I_StructureEntry[] | I_DocumentType[]> {
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
            this.datastore.remove(query, {multi: true}, (err: any, numRemoved: number) => {
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
            if (Object.prototype.hasOwnProperty.call(updateInfo, "owner")) {
                return reject(new Error("Cannot update owner field"));
            }

            const payload: Record<string, unknown> = {...updateInfo};
            for (const k of Object.keys(payload)) {
                if (k.startsWith("$")) {
                    return reject(new Error("Update contains disallowed operator keys"));
                }
            }

            this.datastore.update(
                {_id: documentID},
                {$set: payload},
                {multi: false, upsert: false, returnUpdatedDocs: true}, // returnUpdatedDocs is supported in NeDB
                (err: any, numAffected: number) => {
                    if (err)
                        return reject(err);
                    resolve(numAffected);
                }
            );
        });
    }
}
