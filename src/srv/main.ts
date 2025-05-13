import NetworkManager from "./NetworkManager.js";
import NeDbWrapper from "./NeDbWrapper.js";
import winston from "winston";
import fs from "fs";

const PORT = 3030;
const corsOptions = {
    origin: "*",
    credentials: true
}

const dbPath = "./log"
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
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
            filename: './log/error.log',
            level: 'error',
        }),
        // General log file transport
        new winston.transports.File({ 
            filename: './log/general.log',
        }),
    ],
});

const dataManager = new NeDbWrapper(winstonLogger);
new NetworkManager(winstonLogger, dataManager, PORT, corsOptions);