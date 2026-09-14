import winston from "winston";
import NedbStore from "./NedbStore.js";
import MongoStore, {MongoDbHandle} from "./MongoStore.js";
import type {IDocStore} from "./IDocStore.js";

export type StorageBackend = "nedb" | "mongodb";

export interface IStoreConfig {
    backend: StorageBackend;
    /** NeDB options (ignored when backend is mongodb). */
    nedb: {
        inMemoryOnly: boolean;
        filenamePrefix?: string;
        dbPath?: string;
    };
    /** MongoDB options (ignored when backend is nedb). */
    mongodb: {
        uri?: string;
        dbName: string;
    };
}

/**
 * Creates {@link IDocStore} instances for named collections, backed by
 * either NeDB (default) or MongoDB. All DocPouch collections are created
 * through this factory so the backend selection (`STORAGE_BACKEND` env
 * var) applies uniformly.
 */
export default class StoreFactory {
    private readonly config: IStoreConfig;
    private readonly logger?: winston.Logger;
    private readonly initialized: Promise<void>;

    constructor(config: IStoreConfig, logger?: winston.Logger) {
        this.config = config;
        this.logger = logger;
        if (config.backend === "mongodb" && !config.mongodb.uri) {
            throw new Error("STORAGE_BACKEND=mongodb requires MONGODB_URI to be set");
        }
        this.initialized = this.initialize();
    }

    private async initialize(): Promise<void> {
        if (this.config.backend !== "mongodb") {
            return;
        }
        const uri = this.config.mongodb.uri!;
        this.logger?.info(`Connecting to MongoDB database "${this.config.mongodb.dbName}"`);
        const db = await MongoDbHandle.connect(uri, this.config.mongodb.dbName);
        this.logger?.info("MongoDB connection established");

        // Ensure indexes for every collection DocPouch uses. Collections
        // that are never written to still get their indexes created
        // eagerly, which is cheap and keeps the behavior identical to
        // the NeDB path (where a missing file is created on first write).
        const collectionNames = [
            "users", "documents", "structures", "types",
            "anonymousStructures", "apiKeys", "passwordResetTokens",
            "oidc_Session", "oidc_AccessToken", "oidc_AuthorizationCode",
            "oidc_RefreshToken", "oidc_ClientCredentials", "oidc_Client",
            "oidc_InitialAccessToken", "oidc_RegistrationAccessToken",
            "oidc_DeviceCode", "oidc_BackchannelAuthenticationRequest",
            "oidc_PushedAuthorizationRequest", "oidc_ReplayDetection",
            "oidc_Grant", "oidc_Interaction", "oidc_ResourceServer",
        ];
        for (const collectionName of collectionNames) {
            try {
                await MongoStore.ensureIndexes(db, collectionName);
            } catch (err) {
                this.logger?.warn(`Failed to ensure MongoDB indexes for "${collectionName}": ${err}`);
            }
        }
    }

    get backend(): StorageBackend {
        return this.config.backend;
    }

    /**
     * Resolves when the underlying connection is ready (MongoDB connect
     * and index creation; immediate for NeDB).
     */
    waitForInitialization(): Promise<void> {
        return this.initialized;
    }

    /** Create a store for a collection. NeDB filenames keep the legacy `<prefix><name>.db` scheme. */
    createStore(filename: string | undefined, name: string, description: string, collectionName: string): IDocStore {
        if (this.config.backend === "mongodb") {
            return new MongoStore(collectionName, name, description);
        }
        return new NedbStore(filename, name, description);
    }

    /** NeDB-only: enable autocompaction with the given interval on a store. No-op for MongoDB. */
    setAutocompactionInterval(store: IDocStore, intervalMs: number): void {
        if (this.config.backend !== "mongodb" && store instanceof NedbStore) {
            store.datastore.setAutocompactionInterval(intervalMs);
        }
    }

    async stop(): Promise<void> {
        if (this.config.backend === "mongodb") {
            await MongoDbHandle.close();
        }
    }
}

/**
 * Build a {@link IStoreConfig} from environment variables.
 * Reads `STORAGE_BACKEND` (`nedb` | `mongodb`), `MONGODB_URI`,
 * `MONGODB_DB`, plus the existing NeDB-related variables.
 */
export function storeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): IStoreConfig {
    const backendRaw = (env.STORAGE_BACKEND || "nedb").trim().toLowerCase();
    if (backendRaw !== "nedb" && backendRaw !== "mongodb") {
        throw new Error(`Invalid STORAGE_BACKEND "${backendRaw}". Allowed values: nedb, mongodb.`);
    }
    return {
        backend: backendRaw,
        nedb: {
            inMemoryOnly: env.MEMORY_ONLY?.toLowerCase() === "true",
            filenamePrefix: env.PREFIX || undefined,
            dbPath: "./db",
        },
        mongodb: {
            uri: env.MONGODB_URI,
            dbName: env.MONGODB_DB || "docpouch",
        },
    };
}