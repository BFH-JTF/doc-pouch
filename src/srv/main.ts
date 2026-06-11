import NetworkManager from "./NetworkManager.js";
import NeDbWrapper, {type INeDbOptions} from "./NeDbWrapper.js";
import winston from "winston";
import fs from "fs";
import {checkForUpdates} from "./updateChecker.js";
import {initOidcDatabases, setOidcAdapterLogger} from "./OidcAdapter.js";
import type {I_CorsOption} from "../types.ts";
import dotenv from 'dotenv';

dotenv.config();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "*";
const ALLOWED_HEADERS = process.env.ALLOWED_HEADERS || "";

const origins = ALLOWED_ORIGINS.split(",").map(o => o.trim());
// If the operator did not configure ALLOWED_HEADERS, leave the option
// unset so the cors middleware reflects the browser's
// Access-Control-Request-Headers on preflight. This is the safe
// default for token-auth APIs (no cookies) and avoids breaking
// clients that send additional custom headers (e.g. docpouch-client
// sends X-Socket-ID whenever the socket.io connection is up).
//
// If ALLOWED_HEADERS is set, restrict the preflight to exactly that
// list — the operator's intent is explicit and we should honor it.
const corsOptions: I_CorsOption = {
    origin: origins.length === 1 ? origins[0] : origins,
    allowedHeaders: ALLOWED_HEADERS
        ? ALLOWED_HEADERS.split(",").map(h => h.trim())
        : undefined
}

// use environment variables to configure settings
const PORT = parseInt(process.env.PORT || '3030');
const PREFIX = process.env.PREFIX || undefined;
let MEMORY_ONLY: boolean;
if (process.env.MEMORY_ONLY)
    MEMORY_ONLY = process.env.MEMORY_ONLY.toLowerCase() === "true";
else
    MEMORY_ONLY = false

let ANONYMOUS_DOCUMENTS_ENABLED: boolean;
if (process.env.ANONYMOUS_DOCUMENTS_ENABLED)
    ANONYMOUS_DOCUMENTS_ENABLED = process.env.ANONYMOUS_DOCUMENTS_ENABLED.toLowerCase() === "true";
else
    ANONYMOUS_DOCUMENTS_ENABLED = false

const dbPath = "./log"
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

let winstonLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
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

if (ANONYMOUS_DOCUMENTS_ENABLED) {
    winstonLogger.info("Anonymous document creation is ENABLED. The OIDC session store will be in-memory and document creation logs are reduced for privacy.");
}

// When anonymous documents are enabled, force the OIDC adapter to in-memory
// storage so that the session/access-token NeDB files cannot be used to
// correlate user activity with anonymous document creation.
initOidcDatabases('./db', MEMORY_ONLY || ANONYMOUS_DOCUMENTS_ENABLED);
setOidcAdapterLogger(winstonLogger);

const dataManager = new NeDbWrapper(winstonLogger, dbOptions, {anonymousDocumentsEnabled: ANONYMOUS_DOCUMENTS_ENABLED});

dataManager.waitForInitialization().then(() => {
    winstonLogger.info("Database initialized, starting server...");
    new NetworkManager(winstonLogger, dataManager, PORT, corsOptions, {anonymousDocumentsEnabled: ANONYMOUS_DOCUMENTS_ENABLED});
}).catch((error) => {
    winstonLogger.error(`Failed to initialize database: ${error}`);
    process.exit(1);
});