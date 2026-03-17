import type {NextFunction, Request, Response} from 'express';
import express from 'express';
import path, {dirname} from 'path';
import {fileURLToPath} from 'url';
import cors from 'cors';
import type {I_DocumentType, I_UserCreation, I_UserEntry, I_UserUpdate} from "docpouch-client";
import NeDbWrapper from "./NeDbWrapper.js";
import winston from "winston";
import jwt from "jsonwebtoken"
import SchemaValidator from "./SchemaValidator.js";
import IoSocketServer from "./IoSocketServer.js";
import * as http from "node:http";
import * as os from "node:os";
import fs from "fs";
import multer from "multer";
import archiver from "archiver";
import AdmZip from "adm-zip";
import {JWTOptions} from "./webTokenStuff.js";

export default class NetworkManager {
    corsOptions: any;
    port: number;
    private readonly expressApp: express.Application;
    dataManager: NeDbWrapper;
    private socketServer: IoSocketServer
    webServer: http.Server
    logger: winston.Logger
    validator: SchemaValidator

    constructor(logger: winston.Logger, dataManager: NeDbWrapper, port: number, corsOptions = {
        origin: "*",
        credentials: true
    }) {
        this.corsOptions = corsOptions;
        this.port = port;
        this.expressApp = express();
        this.dataManager = dataManager;
        this.logger = logger;
        this.validator = new SchemaValidator(logger);
        this.webServer = this.expressApp.listen(this.port, () => {
            const networkInterfaces = os.networkInterfaces();
            let hostAddress = 'localhost';

            for (const key in networkInterfaces) {
                if (key.includes('docker') || key.includes('br-') || key.toLowerCase().includes('vethernet')) continue;
                const addresses = networkInterfaces[key];
                if (!addresses) continue;
                for (const address of addresses) {
                    if (address.family === 'IPv4' && !address.internal) {
                        hostAddress = address.address;
                        break;
                    }
                }
            }

            this.logger.log("info", `Server is running on ${hostAddress}:${this.port}`);
        });
        this.socketServer = new IoSocketServer(this, {
            secret: JWTOptions.secret,
            algorithm: JWTOptions.settings.algorithm
        })
        this.initializeExpress();
    }

    private initializeExpress(): void {
        const vuePath = path.resolve(process.cwd(), 'dist/srv/vue');
        this.logger.info(`Serving static files from: ${vuePath}`);

        this.expressApp.use(express.static(vuePath));
        this.expressApp.use(express.json());
        this.expressApp.use(cors(this.corsOptions));
        this.expressApp.disable('etag'); // Disable ETag header to prevent caching of responses

        // Configure multer for file uploads
        const upload = multer({
            dest: 'uploads/',
            limits: {fileSize: 100 * 1024 * 1024} // 100MB limit
        });

        this.expressApp.get('/users/list', this.authenticateJWT, (req, res) => {
            this.dataManager.getUsers(req.userid)
                .then((users: I_UserEntry[]) => {
                    res.status(200).json(users);
                }).catch((error) => {
                res.status(error).json({error: error.message});
            });
        });

        this.expressApp.post("/users/create", this.authenticateJWT, (req, res) => {
            let validatedObject = this.validator.getValidatedObject("userCreation", req.body);
            if (validatedObject !== false) {
                this.dataManager.isAdmin(req.userid).then((isAdmin) => {
                    if (isAdmin) {
                        this.dataManager.createUser(validatedObject as I_UserCreation)
                            .then((newUser) => {
                                this.socketServer.sendEventToAdmins(req.socketID, "newUser", {newUser: newUser});
                                this.logger.info(`New user created: ${JSON.stringify(newUser)}`);
                                res.status(200).json(newUser);
                            })
                            .catch((error) => {
                                res.status(500).json({error: error.message});
                            });
                    } else
                        res.status(401).json({error: "Not authorized to create users"});
                })
            } else
                res.status(400).json({error: "Invalid user data"});
        })

        this.expressApp.post("/users/login", (req: Request, res: Response) => {
            this.logger.info("Login request received");

            try {
                const validatedObject = this.validator.getValidatedObject("userLogin", req.body);
                this.logger.debug(`Validation result: ${JSON.stringify(validatedObject)}`);

                if (validatedObject) {
                    this.logger.debug("Validation passed, calling validateUser");
                    this.dataManager.validateUser(req.body.name, req.body.password)
                        .then((user: I_UserEntry | number) => {
                            if (typeof user === "number") {
                                res.status(user).json({error: "Invalid user or password"});
                            } else {
                                user = user as I_UserEntry;
                                this.logger.debug("User validation result:", user ? "User found" : "User not found");
                                if (user) {
                                    this.logger.info("Creating JWT token");
                                    let token = jwt.sign({id: user._id}, JWTOptions.secret, JWTOptions.settings as jwt.SignOptions);
                                    this.logger.debug("Sending successful response");
                                    res.json({token: token, isAdmin: user.isAdmin || false, userName: user.name});
                                } else {
                                    res.status(401).json({error: "Invalid user or password"});
                                }
                            }
                        })
                } else {
                    this.logger.error("Validation failed - Invalid user data");
                    res.status(401).json({error: "Invalid user data"});
                }
            } catch (error) {
                this.logger.error("Unexpected error in login route:", error);
                res.status(500).json({error: "Internal server error"});
            }
        })

        this.expressApp.patch("/users/update/:userID", this.authenticateJWT, (req: Request, res: Response) => {
            const validatedObject = this.validator.getValidatedObject("userUpdate", req.body);

            if (validatedObject !== false && req.params.userID !== undefined) {
                const userID = req.params.userID;
                const checkPermission = async () => {
                    if (req.userid === userID && !("isAdmin" in validatedObject)) {
                        return true; // User can update their own profile
                    }
                    return await this.dataManager.isAdmin(req.userid);
                };
                checkPermission().then((isAuthorized: boolean) => {
                    if (req.userid !== userID) {
                        if (!isAuthorized)
                            return res.status(401).json({error: "Not authorized to update this user"});
                    }

                    const updateData: I_UserUpdate = {};
                    updateData._id = userID;
                    if (req.body.name) updateData.name = req.body.name;
                    if (req.body.password) updateData.password = req.body.password;
                    if (req.body.email) updateData.email = req.body.email;
                    if (req.body.department) updateData.department = req.body.department;
                    if (req.body.group) updateData.group = req.body.group;
                    if (req.body.isAdmin !== undefined) updateData.isAdmin = req.body.isAdmin;

                    this.dataManager.updateUser(userID, updateData)
                        .then((numUpdated: number) => {
                            if (numUpdated < 1) {
                                res.status(404).json({error: "User not found"});
                            } else if (numUpdated > 1)
                                res.status(500).json({error: "Multiple users with the same ID found"});
                            else {
                                this.socketServer.sendEventToAdmins(req.socketID, "changedUser", {changedUser: updateData})
                                res.status(200).json({message: "User has been successfully updated"});
                            }
                        })
                        .catch((error) => {
                            if (error.message.includes("not found")) {
                                res.status(404).json({error: "User not found"});
                            } else {
                                res.status(500).json({error: error.message});
                            }
                        })
                })

            } else
                res.status(503).json({error: "Invalid user data"});
        });

        this.expressApp.delete("/users/remove/:userID", this.authenticateJWT, (req, res) => {
            this.dataManager.isAdmin(req.userid).then((isAdmin: boolean) => {
                if (!isAdmin)
                    return res.status(401).json({error: "Not authorized to remove this user"});
                else if (req.params.userID !== undefined) {
                    this.dataManager.removeUser(req.params.userID).then(() => {
                        this.socketServer.sendEventToAdmins(req.socketID, "removedUser", {removedID: req.params.userID})
                        res.status(200).json({message: "User has been successfully removed"});
                    }).catch((error) => {
                        res.status(404).json({error: error.message});
                    });
                }
            })
        })

        // Document endpoints with access control
        this.expressApp.get("/docs/list", this.authenticateJWT, (req, res) => {
            this.dataManager.getAllDocuments(req.userid)
                .then((documents) => {
                    res.status(200).json(documents);
                })
                .catch((error) => {
                    res.status(500).json({error: error.message});
                });
        });

        this.expressApp.post("/docs/fetch", this.authenticateJWT, (req, res) => {
            let queryObject = req.body;
            this.validator.getValidatedObject("documentFetch", queryObject);

            this.dataManager.fetchDocuments(req.body, req.userid)
                .then((documents) => {
                    res.status(200).json(documents);
                })
                .catch((error) => {
                    if (error === "Document not found") {
                        res.status(404).json({error: error});
                    } else if (error === "Not authorized to access this document") {
                        res.status(403).json({error: error});
                    } else {
                        res.status(500).json({error: error.message || error});
                    }
                });
        });

        this.expressApp.post("/docs/create", this.authenticateJWT, (req, res) => {
            if (this.validator.getValidatedObject("documentCreation", req.body)) {
                this.dataManager.createDocument(req.body, req.userid)
                    .then((document) => {
                        // Send to document owner and users with access
                        if (document._id) {
                            this.socketServer.sendEventToDocumentAccessors(req.socketID, document._id, "newDocument", {newDocument: document});
                        } else {
                            this.socketServer.sendEventToUser(req.socketID, req.userid, "newDocument", {newDocument: document});
                            this.socketServer.sendEventToAdmins(req.socketID, "newDocument", {newDocument: document})
                        }
                        this.logger.info(`New document created: ${JSON.stringify(document)}`);
                        res.status(200).json(document);
                    })
                    .catch((error) => {
                        res.status(500).json({error: error.message || error});
                    });
            } else {
                res.status(400).json({
                    error: "Invalid document data",
                });
            }
        });

        this.expressApp.patch("/docs/update/:documentID", this.authenticateJWT, (req, res) => {
            if (this.validator.getValidatedObject("documentUpdate", req.body) && req.params.documentID !== undefined) {
                this.dataManager.updateDocument(req.params.documentID, req.body, req.userid)
                    .then((numUpdated) => {
                        if (numUpdated > 0 && req.params.documentID !== undefined) {
                            req.body._id = req.params.documentID;
                            this.socketServer.sendEventToDocumentAccessors(req.socketID, req.params.documentID, "changedDocument", {changedDocument: req.body});
                            res.status(200).json({message: "Document updated successfully"});
                        } else {
                            res.status(404).json({error: "Document not found"});
                        }
                    })
                    .catch((error) => {
                        res.status(error).json({error: error});
                    });
            } else {
                res.status(404).json({error: "Invalid document data"});
            }
        });

        this.expressApp.delete("/docs/remove/:documentID", this.authenticateJWT, (req, res) => {
            if (req.params.documentID !== undefined) {
                this.socketServer.sendEventToDocumentAccessors(req.socketID, req.params.documentID, "removedDocument", {removedID: req.params.documentID}).then(() => {
                    if (req.params.documentID !== undefined) {
                        this.dataManager.removeDocument(req.params.documentID, req.userid)
                            .then((numRemoved) => {
                                if (numRemoved > 0) {
                                    res.status(200).json({message: "Document removed successfully"});

                                    this.logger.info(`Document removed: ${req.params.documentID}`);
                                } else {
                                    res.status(404).json({error: "Document not found"});
                                }
                            })
                            .catch((error) => {
                                res.status(error).json({error: error});
                            });
                    }
                })
            }
        });

        // Structure endpoints with access control
        this.expressApp.get("/structures/list", this.authenticateJWT, (req, res) => {
            this.dataManager.getStructures()
                .then((structures) => {
                    res.status(200).json(structures);
                })
                .catch((error) => {
                    res.status(500).json({error: error.message || error});
                });
        });

        this.expressApp.post("/structures/create", this.authenticateJWT, (req, res) => {
            if (this.validator.getValidatedObject("structureCreation", req.body)) {
                this.dataManager.createStructure(req.body, req.userid)
                    .then((structure) => {
                        this.socketServer.sendEventToAllClients(req.socketID, "newStructure", {newStructure: structure});
                        this.logger.info("New structure created:", structure);
                        res.status(200).json(structure);
                    })
                    .catch((error) => {
                        if (error === "Only admins can create structures") {
                            res.status(401).json({error: error});
                        } else {
                            res.status(500).json({error: error.message || error});
                        }
                    });
            } else {
                res.status(400).json({error: "Invalid structure data"});
            }
        });

        this.expressApp.patch("/structures/update/:structureID", this.authenticateJWT, (req, res) => {
            if (this.validator.getValidatedObject("structureUpdate", req.body) && req.params.structureID !== undefined) {
                const structureID = req.params.structureID;
                this.dataManager.updateStructure(structureID, req.body, req.userid)
                    .then((numUpdated) => {
                        if (numUpdated > 0) {
                            res.status(200).json({message: "Structure updated successfully"});
                            req.body._id = req.params.structureID;
                            this.socketServer.sendEventToAllClients(req.socketID, "changedStructure", {changedStructure: req.body});
                            this.logger.info("Structure updated:", req.body);
                        } else {
                            res.status(404).json({error: "Structure not found"});
                        }
                    })
                    .catch((error) => {
                        res.status(error).json({error: "Unauthorized access"});
                    });
            } else {
                res.status(400).json({error: "Invalid structure data"});
            }
        });

        this.expressApp.delete("/structures/remove/:structureID", this.authenticateJWT, (req, res) => {
            const structureID = req.params.structureID;
            if (structureID !== undefined) {
                this.dataManager.removeStructure(structureID, req.userid)
                    .then((numRemoved) => {
                        if (numRemoved > 0) {
                            res.status(200).json({message: "Structure removed successfully"});
                            this.socketServer.sendEventToAllClients(req.socketID, "removedStructure", {removedID: structureID});
                            this.logger.info("Structure removed:", structureID);
                        } else {
                            res.status(404).json({error: "Structure not found"});
                        }
                    })
                    .catch((error) => {
                        res.status(error).json({error: error.message || error});
                    });
            }
        });

        this.expressApp.post("/types/write", this.authenticateJWT, (req, res) => {
            console.log("Writing document type: ", req.body);
            if (this.validator.getValidatedObject("typeCreation", req.body)) {
                this.dataManager.writeDocumentType(req.body, req.userid)
                    .then((structure) => {
                        this.socketServer.sendEventToAllClients(req.socketID, "newType", {newType: structure});
                        this.logger.info("New document type created:", structure);
                        res.status(200).json(structure);
                    })
                    .catch((error) => {
                        res.status(error).json({error: error});
                    });
            } else {
                res.status(400).json({error: "Invalid document type data"});
            }
        });

        this.expressApp.get('/types/list', this.authenticateJWT, (req, res) => {
            this.dataManager.getDocumentTypes()
                .then((types: I_DocumentType[]) => {
                    res.status(200).json(types);
                }).catch((error) => {
                res.status(500).json({error: error.message});
            });
        });

        this.expressApp.delete("/types/remove/:documentTypeID", this.authenticateJWT, (req, res) => {
            const documentTypeID = req.params.documentTypeID;
            if (documentTypeID !== undefined) {
                this.dataManager.removeDocumentType(documentTypeID, req.userid)
                    .then((numRemoved) => {
                        if (numRemoved > 0) {
                            res.status(200).json({message: "Document type removed successfully"});
                            this.socketServer.sendEventToAllClients(req.socketID, "removedType", {removedID: documentTypeID});
                            this.logger.info("Document type removed:", documentTypeID);
                        } else {
                            res.status(404).json({error: "Document type not found"});
                        }
                    })
                    .catch((error) => {
                        res.status(error).json({error: error});
                    });
            }
        });

        // Database export endpoint
        this.expressApp.get("/database/export", this.authenticateJWT, (req, res) => {
            this.dataManager.isAdmin(req.userid).then((isAdmin) => {
                if (!isAdmin) {
                    return res.status(403).json({error: "Only admins can export the database"});
                }

                const dbPath = "./db";
                const zipFilename = "docpouch-database.zip";
                const output = fs.createWriteStream(zipFilename);
                const archive = archiver('zip', {
                    zlib: {level: 9} // Maximum compression
                });

                // Listen for all archive data to be written
                output.on('close', () => {
                    this.logger.info(`Database exported: ${archive.pointer()} total bytes`);

                    // Send the zip file
                    res.download(zipFilename, (err) => {
                        if (err) {
                            this.logger.error("Error sending zip file:", err);
                        }

                        // Delete the temporary zip file
                        fs.unlink(zipFilename, (err) => {
                            if (err) {
                                this.logger.error("Error deleting temporary zip file:", err);
                            }
                        });
                    });
                });

                // Handle errors
                archive.on('error', (err) => {
                    this.logger.error("Error creating zip archive:", err);
                    res.status(500).json({error: "Error creating zip archive"});
                });

                // Pipe archive data to the file
                archive.pipe(output);

                // Check if db directory exists
                if (!fs.existsSync(dbPath)) {
                    return res.status(404).json({error: "Database directory not found"});
                }

                // Read all files in the db directory
                fs.readdir(dbPath, (err, files) => {
                    if (err) {
                        this.logger.error("Error reading database directory:", err);
                        return res.status(500).json({error: "Error reading database directory"});
                    }

                    // Filter for .db files
                    const dbFiles = files.filter(file => file.endsWith('.db'));

                    if (dbFiles.length === 0) {
                        return res.status(404).json({error: "No database files found"});
                    }

                    // Add each .db file to the archive
                    dbFiles.forEach(file => {
                        const filePath = path.join(dbPath, file);
                        archive.file(filePath, {name: file});
                    });

                    // Finalize the archive
                    archive.finalize();
                });
            }).catch((error) => {
                this.logger.error("Error checking admin status:", error);
                res.status(500).json({error: "Error checking admin status"});
            });
        });

        // Database import endpoint
        this.expressApp.post("/database/import", this.authenticateJWT, upload.single('file'), (req, res) => {
            this.dataManager.isAdmin(req.userid).then(async (isAdmin) => {
                if (!isAdmin) {
                    return res.status(403).json({error: "Only admins can import the database"});
                }

                if (!req.file) {
                    return res.status(400).json({error: "No file uploaded"});
                }

                const uploadedFile = req.file;

                try {
                    // Check if it's a zip file
                    if (!uploadedFile.originalname.endsWith('.zip')) {
                        // Delete the uploaded file
                        fs.unlinkSync(uploadedFile.path);
                        return res.status(400).json({error: "Uploaded file is not a ZIP file"});
                    }

                    // Create AdmZip instance
                    const zip = new AdmZip(uploadedFile.path);
                    const zipEntries = zip.getEntries();

                    // Check if all files in the zip are .db files
                    const invalidFiles = zipEntries.filter(entry => !entry.name.endsWith('.db'));

                    if (invalidFiles.length > 0) {
                        // Delete the uploaded file
                        fs.unlinkSync(uploadedFile.path);
                        return res.status(400).json({
                            error: "ZIP file contains non-database files",
                            invalidFiles: invalidFiles.map(entry => entry.name)
                        });
                    }

                    const dbPath = "./db";

                    // Check if db directory exists, create it if not
                    if (!fs.existsSync(dbPath)) {
                        fs.mkdirSync(dbPath);
                    }

                    // Remove all existing files in the db directory
                    const existingFiles = fs.readdirSync(dbPath);
                    existingFiles.forEach(file => {
                        const filePath = path.join(dbPath, file);
                        fs.unlinkSync(filePath);
                    });

                    // Extract all files to the db directory
                    zip.extractAllTo(dbPath, true);

                    // Delete the uploaded file
                    fs.unlinkSync(uploadedFile.path);

                    this.logger.info("Database imported successfully");
                    res.status(200).json({message: "Database imported successfully"});
                } catch (error) {
                    this.logger.error("Error importing database:", error);

                    // Delete the uploaded file if it exists
                    if (fs.existsSync(uploadedFile.path)) {
                        fs.unlinkSync(uploadedFile.path);
                    }

                    res.status(500).json({error: "Error importing database"});
                }
            }).catch((error) => {
                this.logger.error("Error checking admin status:", error);

                // Delete the uploaded file if it exists
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }

                res.status(500).json({error: "Error checking admin status"});
            });
        });

        this.expressApp.use((req, res, next) => {
            // Skip for API routes that are already handled
            if (req.path.startsWith('/api') ||
                req.path.startsWith('/users') ||
                req.path.startsWith('/docs') ||
                req.path.startsWith('/types') ||
                req.path.startsWith('/structures') ||
                req.path.startsWith('/database')) {
                return next();
            }

            // For all other routes, serve the index.html file
            res.sendFile(path.join(vuePath, 'index.html'));
        });


    }

    private authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
        try {
            const authHeader = req.headers['authorization'];
            if (!authHeader) {
                res.status(401).json({error: "No authorization header"});
                return
            }

            const token = authHeader && authHeader.split(' ')[1];
            if (token == null) {
                res.status(401).json({error: "No token provided"});
                return
            }

            jwt.verify(token, JWTOptions.secret, (err: any, payload: any) => {
                if (err) return res.sendStatus(401);
                this.dataManager.getUserByID(payload.id).then((user) => {
                    if (!user) {
                        res.status(401).json({error: "User not found"});
                        return
                    }
                    req.userid = payload.id;
                    if (req.headers['x-socket-id'])
                        req.socketID = req.headers['x-socket-id'] as string;
                    next();
                }).catch((error) => {
                    res.status(500).json({error: error.message});
                    return
                })
            });
        } catch (error) {
            res.status(500).json({error: "Authentication error"});
            return
        }
    };

}
