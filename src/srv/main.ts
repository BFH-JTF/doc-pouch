import NetworkManager from "./NetworkManager.js";
import NeDbWrapper from "./NeDbWrapper.js";
import winston from "winston";

const PORT = 80;
const corsOptions = {
    origin: "*",
    credentials: true
}

let winstonLogger = winston.createLogger({
    level: 'info',
    defaultMeta: { service: 'user-service' },
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
            return `[${timestamp}] [${level}] - ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: 'error.log',
            level: 'error',
        }),
        // General log file transport
        new winston.transports.File({ 
            filename: 'general.log',
        }),
    ],
});

const dataManager = new NeDbWrapper(winstonLogger);
const networkManager = new NetworkManager(winstonLogger, dataManager, PORT, corsOptions);