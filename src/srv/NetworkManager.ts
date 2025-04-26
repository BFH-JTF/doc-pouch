import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
import ws from 'ws';
import NeDbWrapper, {I_dbUser} from "./NeDbWrapper.js";
import winston from "winston";  // TODO Add WSS connection

export default class NetworkManager{
    corsOptions: any;
    port: number;
    expressApp: express.Application | null;
    private dataManager: NeDbWrapper;
    logger: winston.Logger

    constructor(logger: winston.Logger, dataManager: NeDbWrapper, port = 3300, corsOptions = {origin: "*", credentials: true}) {
        this.corsOptions = corsOptions;
        this.port = port;
        this.expressApp = null;
        this.dataManager = dataManager;
        this.logger = logger;
        this.initialize();
    }

    private initialize(): void {
        if (this.expressApp == null) {
            this.expressApp = express();

            const wsServer = new ws.Server({ noServer: true });
            wsServer.on('connection', socket => {
                socket.on('message', message => console.log(message));
            });

            const webServer = this.expressApp.listen(this.port);
            webServer.on('upgrade', (request, socket, head) => {
                wsServer.handleUpgrade(request, socket, head, socket => {
                    wsServer.emit('connection', socket, request);
                });
            });

            //TODO notification on updates, keep-alive
        }

        let myDirname = dirname(fileURLToPath(import.meta.url));
        this.expressApp.use(express.static(path.join(myDirname, 'public')));
        this.expressApp.use(express.json());
        this.expressApp.use(cors(this.corsOptions));

        this.expressApp.get('/users/list', (req, res) => {
            this.dataManager.getUsers()
                .then((users: I_dbUser[]) => {
                    const returnArray = users.map(user => {
                            return {
                                id: user.id,
                                username: user.name,
                                email: user.email,
                            };
                        });
                    return Promise.all(returnArray);
                    })
                    .then((result) => {
                        res.json(result);
                    }).catch((error) => {
                res.status(500).json({ error: error.message });
            })
        });

        this.expressApp.post("/users/create", (req, res) => {
            this.dataManager.createUser(req.body)
                .then((result) => {
                    this.logger.info("New user created:", user);
                    res.status(200).json(result);
                })
                .catch((error) => {res.status(500).json({ error: error.message }); });
            })

        this.expressApp.get("/auth/:userName/:password", (req:express.Request, res:express.Response) => {
            const selectUserCredentials = this.dataManager.u
                db.prepare('SELECT id, loginType, credentials FROM users WHERE users.name = ?');
            let userInfo = <IUserInfo> selectUserCredentials.get(String(req.params.userName));
            switch (req.params.loginType){
                case "local":
                    if (userInfo.credentials === req.params.credentials){
                        let token = jwt.sign({userID: userInfo.id}, JWTOptions.secret, {
                            algorithm: "HS512",
                            expiresIn: "4h",
                            issuer: "MMP"
                        });
                        res.json({JWT: token});
                    }
                    else
                        res.sendStatus(403)
                    break;
            }
        })

        this.expressApp.listen(this.port, () => {
            this.logger.log("info", "Server is running on http://localhost:" + this.port);
        });
    }
}