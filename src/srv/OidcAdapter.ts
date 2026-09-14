import path from "path";
import fs from "fs";
import type winston from "winston";
import StoreFactory, {storeConfigFromEnv} from "./storage/storeFactory.js";
import NedbStore from "./storage/NedbStore.js";
import type {IDocStore} from "./storage/IDocStore.js";

const OIDC_MODELS = [
    'Session', 'AccessToken', 'AuthorizationCode', 'RefreshToken',
    'ClientCredentials', 'Client', 'InitialAccessToken',
    'RegistrationAccessToken', 'DeviceCode', 'BackchannelAuthenticationRequest',
    'PushedAuthorizationRequest', 'ReplayDetection', 'Grant', 'Interaction',
    'ResourceServer'
];

const datastores = new Map<string, IDocStore>();
let dbPath = './db';
let inMemoryOnly = false;
let storeFactory: StoreFactory | null = null;
let adapterLogger: winston.Logger | null = null;
let adapterDebug = process.env.OIDC_ADAPTER_DEBUG === 'true';

function dbg(payload: Record<string, unknown>): void {
    if (adapterDebug && adapterLogger) {
        adapterLogger.debug(payload);
    }
}

function collectionName(modelName: string): string {
    return `oidc-${modelName}`;
}

function getDatastore(modelName: string): IDocStore {
    if (!datastores.has(modelName)) {
        datastores.set(modelName, createStoreForModel(modelName));
    }
    return datastores.get(modelName)!;
}

function createStoreForModel(modelName: string): IDocStore {
    const displayName = `OIDC ${modelName}`;
    const description = `OIDC provider records of model type ${modelName}`;
    if (storeFactory) {
        // When a shared factory is wired in (main.ts), the OIDC models use
        // the same backend as the core collections.
        return storeFactory.createStore(
            storeFactory.backend === "nedb" && !inMemoryOnly
                ? path.join(dbPath, `${collectionName(modelName)}.db`)
                : undefined,
            displayName, description, collectionName(modelName));
    }
    if (inMemoryOnly) {
        return new NedbStore(undefined, displayName, description);
    }
    return new NedbStore(path.join(dbPath, `${collectionName(modelName)}.db`), displayName, description);
}

/**
 * Backwards-compatible entry point used by tests: initializes NeDB-backed
 * (or in-memory) OIDC stores without wiring the global StoreFactory.
 */
export function initOidcDatabases(dbDir: string, memoryOnly = false): void {
    dbPath = dbDir;
    inMemoryOnly = memoryOnly;
    if (!inMemoryOnly && !fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, {recursive: true});
    }
    resetOidcDatastores();
    for (const model of OIDC_MODELS) {
        getDatastore(model);
    }
}

/**
 * Wire a winston logger into the OidcAdapter so the adapter emits
 * debug-level events (find, upsert, destroy, etc.) that are useful
 * for diagnosing OIDC session and XSRF mismatches.
 *
 * Debug output is gated by the OIDC_ADAPTER_DEBUG env var; this
 * function just attaches the logger — the gate is read at module
 * load time, so call this *after* the env has been processed.
 */
export function setOidcAdapterLogger(logger: winston.Logger): void {
    adapterLogger = logger;
    if (process.env.OIDC_ADAPTER_DEBUG === 'true') {
        adapterDebug = true;
        adapterLogger.info('OIDC adapter debug logging enabled');
    }
}

export function resetOidcDatastores(): void {
    for (const ds of datastores.values()) {
        try {
            ds.stop();
        } catch {
            // ignore - some datastores may not expose the method
        }
    }
    datastores.clear();
}

export async function closeOidcDatabases(): Promise<void> {
    resetOidcDatastores();
    if (inMemoryOnly || !dbPath) {
        return;
    }
    const filepath = dbPath;
    for (const model of OIDC_MODELS) {
        const filename = path.join(filepath, `oidc-${model}.db`);
        try {
            await fs.promises.unlink(filename);
        } catch {
            // ignore if file doesn't exist
        }
    }
}

/**
 * Removes all records from every OIDC datastore. Intended for test setup
 * so that each test starts from a clean OIDC state (no sessions, grants,
 * clients, etc.) without needing to reinitialize the adapter.
 */
export function clearAllOidcData(): Promise<void> {
    const targets: string[] = [];
    for (const model of OIDC_MODELS) {
        getDatastore(model);
        targets.push(model);
    }
    return new Promise((resolve, reject) => {
        let pending = targets.length;
        let failed = false;
        if (pending === 0) {
            resolve();
            return;
        }
        for (const model of targets) {
            const ds = datastores.get(model);
            if (!ds) {
                pending--;
                if (pending === 0) resolve();
                continue;
            }
            ds.remove({}, {multi: true}).then(() => {
                if (failed) return;
                pending--;
                if (pending === 0) resolve();
            }).catch((err: Error) => {
                if (failed) return;
                failed = true;
                reject(err);
            });
        }
    });
}

export default class OidcAdapter {
    constructor(private modelName: string) {
        getDatastore(modelName);
    }

    private get store(): IDocStore {
        return getDatastore(this.modelName);
    }

    upsert(id: string, payload: any, expiresIn?: number): Promise<void> {
        const doc: Record<string, any> = {...payload};
        delete doc._id;
        delete doc._rev;
        if (expiresIn) {
            doc.expiresAt = Date.now() + expiresIn * 1000;
        }
        dbg({
            event: 'adapter.upsert',
            model: this.modelName,
            id,
            kind: doc.kind || doc.payload?.kind,
            hasAccount: !!doc.accountId
        });
        return new Promise((resolve, reject) => {
            this.store.updateOne({_id: id}, {$set: doc}, {upsert: true}, (err: Error | null) => {
                if (err) {
                    dbg({event: 'adapter.upsert.error', model: this.modelName, id, err: err.message});
                    reject(err);
                } else resolve(undefined);
            });
        });
    }

    find(id: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.store.findOne({_id: id}).then((doc: any) => {
                dbg({
                    event: 'adapter.find',
                    model: this.modelName,
                    id,
                    found: !!doc,
                    accountId: doc?.accountId,
                    hasState: !!doc?.state,
                    stateHasSecret: !!(doc?.state && doc.state.secret),
                    uid: doc?.uid,
                    transient: doc?.transient,
                    expired: doc?.expiresAt ? doc.expiresAt < Date.now() : false
                });
                resolve(doc || undefined);
            }).catch((err: Error) => {
                dbg({event: 'adapter.find.error', model: this.modelName, id, err: err.message});
                reject(err);
            });
        });
    }

    findByUid(uid: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.store.findOne({uid}).then((doc: any) => {
                dbg({event: 'adapter.findByUid', model: this.modelName, uid, found: !!doc, _id: doc?._id});
                resolve(doc || undefined);
            }).catch((err: Error) => {
                dbg({event: 'adapter.findByUid.error', model: this.modelName, uid, err: err.message});
                reject(err);
            });
        });
    }

    findByUserCode(userCode: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.store.findOne({userCode}).then((doc: any) => {
                dbg({
                    event: 'adapter.findByUserCode',
                    model: this.modelName,
                    userCode,
                    found: !!doc,
                    _id: doc?._id
                });
                resolve(doc || undefined);
            }).catch((err: Error) => {
                dbg({event: 'adapter.findByUserCode.error', model: this.modelName, userCode, err: err.message});
                reject(err);
            });
        });
    }

    destroy(id: string): Promise<void> {
        dbg({event: 'adapter.destroy', model: this.modelName, id});
        return new Promise((resolve, reject) => {
            this.store.removeOne({_id: id}, {}).then(() => resolve(undefined)).catch((err: Error) => {
                dbg({event: 'adapter.destroy.error', model: this.modelName, id, err: err.message});
                reject(err);
            });
        });
    }

    revokeByGrantId(grantId: string): Promise<void> {
        dbg({event: 'adapter.revokeByGrantId', model: this.modelName, grantId});
        return new Promise((resolve, reject) => {
            this.store.removeOne({grantId}, {multi: true}).then(() => resolve(undefined)).catch((err: Error) => {
                dbg({event: 'adapter.revokeByGrantId.error', model: this.modelName, grantId, err: err.message});
                reject(err);
            });
        });
    }

    consume(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.store.updateOne({_id: id}, {$set: {consumed: true}}, {}).then(() => resolve(undefined)).catch((err: Error) => {
                dbg({event: 'adapter.consume.error', model: this.modelName, id, err: err.message});
                reject(err);
            });
        });
    }
}

/**
 * Wire the global StoreFactory (and its backend selection) into the OIDC
 * adapter. When called, all OIDC model stores are created through the
 * factory — MongoDB when `STORAGE_BACKEND=mongodb`, NeDB otherwise.
 */
export function setOidcStoreFactory(factory: StoreFactory, dbDir: string, memoryOnly: boolean): void {
    storeFactory = factory;
    dbPath = dbDir;
    inMemoryOnly = memoryOnly;
    resetOidcDatastores();
}