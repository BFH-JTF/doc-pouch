import NetworkManager from "./NetworkManager.js";
import NeDbWrapper, {type INeDbOptions} from "./NeDbWrapper.js";
import winston from "winston";
import fs from "fs";

const corsOptions = {
    origin: "*",
    credentials: true
}

// use environment variables to configure settings
const PORT = parseInt(process.env.PORT || '3030');
const PREFIX = process.env.PREFIX || undefined;
let MEMORY_ONLY: boolean;
if (process.env.MEMORY_ONLY)
    MEMORY_ONLY = process.env.MEMORY_ONLY.toLowerCase() === "true";
else
    MEMORY_ONLY = false

const dbPath = "./log"
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

let winstonLogger = winston.createLogger({
    level: 'debug',
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

let dbOptions: INeDbOptions = {
    inMemoryOnly: MEMORY_ONLY,
    filenamePrefix: PREFIX
}

const dataManager = new NeDbWrapper(winstonLogger, dbOptions);
new NetworkManager(winstonLogger, dataManager, PORT, corsOptions);