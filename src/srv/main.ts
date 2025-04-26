import NetworkManager from "./NetworkManager.js";
import NeDbWrapper from "./NeDbWrapper.js";
import winston from "winston"

const PORT = 3300;
const corsOptions = {
    origin: "*",
    credentials: true
}
let winstonLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    defaultMeta: { service: 'user-service' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'general.log' }),
    ],
})

const dataManager = new NeDbWrapper(winstonLogger);
const networkManager = new NetworkManager(winstonLogger, dataManager, PORT, corsOptions);

