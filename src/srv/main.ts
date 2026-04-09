import NetworkManager from "./NetworkManager.js";
import NeDbWrapper, {type INeDbOptions} from "./NeDbWrapper.js";
import winston from "winston";
import fs from "fs";
import {checkForUpdates} from "./updateChecker.js";

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "*";
const ALLOWED_HEADERS = process.env.ALLOWED_HEADERS || "Content-Type, Authorization";

const origins = ALLOWED_ORIGINS.split(",").map(o => o.trim());
const corsOptions: {
    origin: string | string[];
    credentials: boolean;
    allowedHeaders: string[];
} = {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true,
    allowedHeaders: ALLOWED_HEADERS.split(",").map(h => h.trim())
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

let dbOptions: INeDbOptions = {
    inMemoryOnly: MEMORY_ONLY,
    filenamePrefix: PREFIX
}

checkForUpdates(winstonLogger);

const dataManager = new NeDbWrapper(winstonLogger, dbOptions);
new NetworkManager(winstonLogger, dataManager, PORT, corsOptions);