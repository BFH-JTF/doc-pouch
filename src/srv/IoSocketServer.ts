import {Server, Socket} from "socket.io";
import type {I_DocumentEntry, I_WsMessage, I_EventString} from "docpouch-client";
import type {I_Client} from "../types.ts";
import type NetworkManager from "./NetworkManager.ts";
import jwt from "jsonwebtoken";

export default class IoSocketServer {
    private ioSocket: Server;
    private wsClientList: I_Client[]
    private networkManager: NetworkManager;
    private JWTOptions: {secret: string, algorithm: string};
    private heartbeatInterval: NodeJS.Timeout;

    constructor(networkManager: NetworkManager, JWTOptions: {secret: string, algorithm: string}) {
        this.wsClientList = [];
        this.JWTOptions = JWTOptions;
        this.networkManager = networkManager;
        this.ioSocket = new Server(this.networkManager.webServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            allowEIO3: true
        });

        this.ioSocket.use((socket, next) => this.authMiddleware(socket, next));

        this.ioSocket.on('connection', (socket) => {
            let client = this.getClientBySocketID(socket.id);
            if (!client) {
                this.networkManager.logger.error(`Unknown client connected: ${socket.id}`);
                socket.disconnect(true);
                return;
            } else if (client.userid) {
                this.networkManager.dataManager.getUserByID(client.userid)
                    .then((userInfo) => {
                        this.networkManager.logger.info(`Client connected: ${client.userid} - ${socket.id}`);

                        // Run consistency check if the user is an admin
                        if (userInfo.isAdmin) {
                            this.networkManager.dataManager.checkDatabaseConsistency().then((faultyDocs) => {
                                if (faultyDocs.length > 0) {
                                    this.networkManager.logger.warn(`Found ${faultyDocs.length} faulty documents during consistency check for admin ${userInfo.name}`);
                                    this.sendEventToClient(undefined, client, "databaseInconsistency" as any, {faultyDocuments: faultyDocs} as any);
                                }
                            }).catch(err => {
                                this.networkManager.logger.error("Error during database consistency check:", err);
                            });
                        }

                        socket.on('disconnect', () => {
                            this.networkManager.logger.info(`Client disconnected: ${client.userid} - ${socket.id}`);
                            this.wsClientList = this.wsClientList.filter(c => c.socket.id !== socket.id);
                        });

                        socket.on("heartbeatPong", () => {
                            client.lastPongReceived = Date.now();
                        });
                    })
                    .catch((error) => {
                        this.networkManager.logger.error(`Failed to get user info for ID ${client.userid}: ${error.message}`);
                        socket.on('disconnect', () => {
                            this.networkManager.logger.info(`Client disconnected: ${client.userid} - ${socket.id}`);
                            this.wsClientList = this.wsClientList.filter(c => c.socket.id !== socket.id);
                        });

                        socket.on("heartbeatPong", () => {
                            client.lastPongReceived = Date.now();
                        });
                    });
            } else {
                // Handle case where client exists but doesn't have a user ID
                this.networkManager.logger.warn(`Client connected without user ID: ${socket.id}`);
                socket.disconnect(true);
            }
        });

        // Heartbeat check interval
        this.heartbeatInterval = setInterval(() => {
            let now = Date.now();
            for (let i = this.wsClientList.length - 1; i >= 0; i--) {
                const client = this.wsClientList[i];

                if (client.lastPingSent < now - 60000) {
                    client.lastPingSent = now;
                    try {
                        this.ioSocket.to(client.socket.id).emit("heartbeatPing");
                    } catch (err) {
                        this.networkManager.logger.error("Error sending ping to client: ", client.socket.id, err);
                    }
                }

                if (client.lastPongReceived < now - 120000 && client.lastPingSent > client.lastPongReceived) {
                    this.networkManager.logger.warn("Client disconnected due to inactivity:", client.socket.id);
                    try {
                        client.socket.disconnect();
                    } catch (err) {
                        this.networkManager.logger.error("Error disconnecting client: ", client.socket.id, err);
                    } finally {
                        this.wsClientList.splice(i, 1);
                    }
                }
            }
        }, 60000);
    }

    public close() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.ioSocket.close();
    }

    sendEventToUser(sourceID: string | undefined, userID: string, event: I_EventString, data?: I_WsMessage) {
        this.networkManager.logger.debug(`Attempting to send event '${event}' to userID: ${userID}, sourceID: ${sourceID || 'undefined'}`);

        // Debug: Log all clients in the list
        this.networkManager.logger.debug(`Current wsClientList has ${this.wsClientList.length} clients`);
        if (this.wsClientList.length > 0) {
            const clientIDs = this.wsClientList.map(c => `${c.userid}:${c.socket.id}`);
            this.networkManager.logger.debug(`Available clients: ${clientIDs.join(', ')}`);
        }

        const clients = this.wsClientList.filter(client => client.userid === userID);

        if (clients && clients.length > 0) {
            this.networkManager.logger.debug(`Found ${clients.length} clients for userID: ${userID}`);
            for (let client of clients) {
                this.sendEventToClient(sourceID, client, event, data);
            }
        } else {
            this.networkManager.logger.warn(`No clients found for userID: ${userID} when trying to send event: ${event}`);
        }
    }

    sendEventToAdmins(sourceID: string | undefined, event: I_EventString, data?: I_WsMessage) {
        for (const client of this.wsClientList) {
            if (client.isAdmin) {
                this.sendEventToClient(sourceID, client, event, data);
            }
        }
    }

    sendEventToAllClients(sourceID: string | undefined, event: I_EventString, data?: I_WsMessage) {
        this.networkManager.logger.debug(`Sending event '${event}' to all connected clients`);
        for (const client of this.wsClientList) {
            this.sendEventToClient(sourceID, client, event, data);
        }
    }


    async sendEventToDocumentAccessors(sourceID: string | undefined, documentID: string, event: I_EventString, data?: I_WsMessage) {
        this.networkManager.logger.debug(`Sending event '${event}' for document ${documentID} to users with access`);

        try {
            // Get the document to check sharing settings
            const docQuery = await this.networkManager.dataManager.documents.query({_id: documentID});

            if (docQuery.length === 0) {
                this.networkManager.logger.warn(`Document ${documentID} not found when trying to send event`);
                return;
            }

            const document = docQuery[0] as I_DocumentEntry;
            const ownerID = document.owner;

            // Always send to the document owner's connected clients, excluding the source if specified
            const ownerClients = this.wsClientList.filter(client =>
                client.userid === ownerID &&
                (!sourceID || client.socket.id !== sourceID)
            );

            for (const client of ownerClients) {
                this.sendEventToClient(sourceID, client, event, data);
            }

            // If document is shared with department or group, find users who have access
            if (document.shareWithDepartment || document.shareWithGroup) {
                // Get the owner's user info to determine department and group
                const ownerInfo = await this.networkManager.dataManager.getUserByID(ownerID);

                if (document.shareWithDepartment) {
                    // Get all users in the same department
                    try {
                        const departmentUsers = await this.networkManager.dataManager.getUsersByDepartmentName(ownerInfo.department);
                        for (const user of departmentUsers) {
                            // Find all of this user's connected clients, excluding the source
                            const userClients = this.wsClientList.filter(client =>
                                client.userid === user._id &&
                                (!sourceID || client.socket.id !== sourceID)
                            );
                            for (const client of userClients) {
                                this.sendEventToClient(sourceID, client, event, data);
                            }
                        }
                    } catch (error) {
                        this.networkManager.logger.error(`Error getting department users: ${error}`);
                    }
                }

                if (document.shareWithGroup) {
                    // Get all users in the same group and department
                    try {
                        const groupUsers = await this.networkManager.dataManager.getUsersByGroupName(ownerInfo.group, ownerInfo.department);
                        for (const user of groupUsers) {
                            if (user._id !== ownerID) { // Skip owner as we've already sent to them
                                // Find all of this user's connected clients, excluding the source
                                const userClients = this.wsClientList.filter(client =>
                                    client.userid === user._id &&
                                    (!sourceID || client.socket.id !== sourceID)
                                );

                                for (const client of userClients) {
                                    this.sendEventToClient(sourceID, client, event, data);
                                }
                            }
                        }
                    } catch (error) {
                        this.networkManager.logger.error(`Error getting group users: ${error}`);
                    }
                }
            }

            // Always send to admins, excluding the source if specified
            const adminClients = this.wsClientList.filter(client =>
                client.isAdmin &&
                (!sourceID || client.socket.id !== sourceID)
            );

            for (const client of adminClients) {
                this.sendEventToClient(sourceID, client, event, data);
            }

        } catch (error) {
            this.networkManager.logger.error(`Error in sendEventToDocumentAccessors: ${error}`);
        }
    }

    sendEventToClient(sourceID: string | undefined, client: I_Client, event: I_EventString, data?: I_WsMessage) {
        if (!sourceID || sourceID !== client.socket.id) {
            try {
                this.ioSocket.to(client.socket.id).emit(event, data);
            } catch (err) {
                this.networkManager.logger.error("Error sending event to client: ", client.socket.id, err);
            }
        }
    }

    private getClientBySocketID(socketID: string): I_Client | undefined {
        return this.wsClientList.find(client => client.socket.id === socketID);
    }

    private getClientsByUserID(userID: string): I_Client[] | undefined {
        const clients = this.wsClientList.filter(client => client.userid === userID);
        this.networkManager.logger.debug(`getClientsByUserID: Found ${clients.length} clients for userID: ${userID}`);
        return clients.length > 0 ? clients : undefined;
    }


    private authMiddleware(socket: Socket, next: Function) {
        this.networkManager.logger.debug(`Auth middleware running for socket ${socket.id}`);

        const token = socket.handshake.auth.token;
        if (!token) {
            this.networkManager.logger.warn(`Socket ${socket.id} has no auth token`);
            return next(new Error('Authentication error: No token provided'));
        }

        // Try JWT token first
        try {
            this.networkManager.logger.debug(`Verifying JWT token for socket ${socket.id}`);

            jwt.verify(token, this.JWTOptions.secret, (err: any, payload: any) => {
                if (!err && payload && payload.id) {
                    this.networkManager.logger.debug(`JWT verified successfully for user ${payload.id}, socket ${socket.id}`);
                    this.networkManager.dataManager.getUserByID(payload.id).then(user => {
                        const client = {
                            socket: socket,
                            userid: payload.id,
                            isAdmin: user.isAdmin,
                            lastPingSent: Date.now(),
                            lastPongReceived: Date.now()
                        };

                        // Check if this client already exists in the list (by socket ID)
                        const existingClientIndex = this.wsClientList.findIndex(c => c.socket.id === socket.id);
                        if (existingClientIndex >= 0) {
                            this.networkManager.logger.debug(`Replacing existing client in wsClientList at index ${existingClientIndex}`);
                            this.wsClientList[existingClientIndex] = client;
                        } else {
                            this.networkManager.logger.debug(`Adding new client to wsClientList: userID=${payload.id}, socketID=${socket.id}`);
                            this.wsClientList.push(client);
                        }

                        next();
                    }).catch((error) => {
                        this.networkManager.logger.error(`Failed to get user by ID ${payload.id}: ${error}`);
                        return next(new Error('Authentication error: User not found'));
                    });
                } else {
                    // JWT failed, try OIDC token
                    this.tryOidcToken(socket, token, next);
                }
            });
        } catch (error) {
            // JWT exception, try OIDC token
            this.tryOidcToken(socket, token, next);
        }
    }

    private tryOidcToken(socket: Socket, token: string, next: Function) {
        this.networkManager.logger.debug(`Trying OIDC token for socket ${socket.id}`);

        this.networkManager.oidcProvider.AccessToken.find(token).then((accessToken: any) => {
            if (accessToken && accessToken.accountId) {
                this.networkManager.logger.debug(`OIDC token verified for user ${accessToken.accountId}, socket ${socket.id}`);
                this.networkManager.dataManager.getUserByID(accessToken.accountId).then(user => {
                    const client = {
                        socket: socket,
                        userid: accessToken.accountId,
                        isAdmin: user.isAdmin,
                        lastPingSent: Date.now(),
                        lastPongReceived: Date.now()
                    };

                    const existingClientIndex = this.wsClientList.findIndex(c => c.socket.id === socket.id);
                    if (existingClientIndex >= 0) {
                        this.wsClientList[existingClientIndex] = client;
                    } else {
                        this.wsClientList.push(client);
                    }

                    next();
                }).catch((error) => {
                    this.networkManager.logger.error(`Failed to get user by ID ${accessToken.accountId}: ${error}`);
                    return next(new Error('Authentication error: User not found'));
                });
            } else {
                this.networkManager.logger.error(`OIDC token verification failed for socket ${socket.id}`);
                return next(new Error('Authentication error: Invalid token'));
            }
        }).catch((error: any) => {
            this.networkManager.logger.error(`Exception in OIDC token verification for socket ${socket.id}: ${error}`);
            return next(new Error('Authentication error: Invalid token'));
        });
    }
}
