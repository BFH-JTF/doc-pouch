import Nedb from "@seald-io/nedb";
import path from "path";
import fs from "fs";
import type winston from "winston";

declare const NedbConstructor: new (options?: any) => any;
type NedbInstance = InstanceType<typeof NedbConstructor>;

const OIDC_MODELS = [
    'Session', 'AccessToken', 'AuthorizationCode', 'RefreshToken',
    'ClientCredentials', 'Client', 'InitialAccessToken',
    'RegistrationAccessToken', 'DeviceCode', 'BackchannelAuthenticationRequest',
    'PushedAuthorizationRequest', 'ReplayDetection', 'Grant', 'Interaction',
    'ResourceServer'
];

const datastores = new Map<string, NedbInstance>();
let dbPath = './db';
let inMemoryOnly = false;
let adapterLogger: winston.Logger | null = null;
let adapterDebug = process.env.OIDC_ADAPTER_DEBUG === 'true';

function dbg(payload: Record<string, unknown>): void {
    if (adapterDebug && adapterLogger) {
        adapterLogger.debug(payload);
    }
}

function getDatastore(modelName: string): NedbInstance {
    if (!datastores.has(modelName)) {
        const dsOptions: Record<string, any> = inMemoryOnly
            ? {inMemoryOnly: true}
            : {filename: path.join(dbPath, `oidc-${modelName}.db`), autoload: true};
        const ds = new (Nedb as any)(dsOptions) as NedbInstance;
        ds.setAutocompactionInterval(1000 * 60 * 5);
        datastores.set(modelName, ds);
    }
    return datastores.get(modelName)!;
}

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
            (ds as any).stopAutocompaction?.();
        } catch {
            // ignore - some datastores may not expose the method
        }
    }
    datastores.clear();
}

/**
 * Removes all records from every OIDC datastore. Intended for test setup
 * so that each test starts from a clean OIDC state (no sessions, grants,
 * clients, etc.) without needing to reinitialize the adapter.
 */
export function clearAllOidcData(): Promise<void> {
    for (const model of OIDC_MODELS) {
        getDatastore(model);
    }
    return new Promise((resolve, reject) => {
        const targets = Array.from(datastores.keys());
        let pending = targets.length;
        if (pending === 0) {
            resolve();
            return;
        }
        let failed = false;
        for (const model of targets) {
            const ds = datastores.get(model);
            if (!ds) {
                pending--;
                if (pending === 0) resolve();
                continue;
            }
            (ds as any).remove({}, {multi: true}, (err: Error | null) => {
                if (failed) return;
                if (err) {
                    failed = true;
                    reject(err);
                    return;
                }
                pending--;
                if (pending === 0) resolve();
            });
        }
    });
}

export default class OidcAdapter {
    constructor(private modelName: string) {
        getDatastore(modelName);
    }

    private get datastore(): NedbInstance {
        return getDatastore(this.modelName);
    }

    upsert(id: string, payload: any, expiresIn?: number): Promise<void> {
        return new Promise((resolve, reject) => {
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
            this.datastore.update({_id: id}, {$set: doc}, {upsert: true}, (err: Error | null) => {
                if (err) {
                    dbg({event: 'adapter.upsert.error', model: this.modelName, id, err: err.message});
                    reject(err);
                } else resolve(undefined);
            });
        });
    }

    find(id: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.findOne({_id: id}, (err: Error | null, doc: any) => {
                if (err) {
                    dbg({event: 'adapter.find.error', model: this.modelName, id, err: err.message});
                    reject(err);
                } else {
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
                }
            });
        });
    }

    findByUid(uid: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.findOne({uid}, (err: Error | null, doc: any) => {
                if (err) {
                    dbg({event: 'adapter.findByUid.error', model: this.modelName, uid, err: err.message});
                    reject(err);
                } else {
                    dbg({event: 'adapter.findByUid', model: this.modelName, uid, found: !!doc, _id: doc?._id});
                    resolve(doc || undefined);
                }
            });
        });
    }

    findByUserCode(userCode: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.findOne({userCode}, (err: Error | null, doc: any) => {
                if (err) {
                    dbg({event: 'adapter.findByUserCode.error', model: this.modelName, userCode, err: err.message});
                    reject(err);
                } else {
                    dbg({
                        event: 'adapter.findByUserCode',
                        model: this.modelName,
                        userCode,
                        found: !!doc,
                        _id: doc?._id
                    });
                    resolve(doc || undefined);
                }
            });
        });
    }

    destroy(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            dbg({event: 'adapter.destroy', model: this.modelName, id});
            this.datastore.remove({_id: id}, {}, (err: Error | null) => {
                if (err) {
                    dbg({event: 'adapter.destroy.error', model: this.modelName, id, err: err.message});
                    reject(err);
                } else resolve(undefined);
            });
        });
    }

    revokeByGrantId(grantId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            dbg({event: 'adapter.revokeByGrantId', model: this.modelName, grantId});
            this.datastore.remove({grantId}, {multi: true}, (err: Error | null) => {
                if (err) {
                    dbg({event: 'adapter.revokeByGrantId.error', model: this.modelName, grantId, err: err.message});
                    reject(err);
                } else resolve(undefined);
            });
        });
    }

    consume(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.datastore.update({_id: id}, {$set: {consumed: true}}, {}, (err: Error | null) => {
                if (err) {
                    dbg({event: 'adapter.consume.error', model: this.modelName, id, err: err.message});
                    reject(err);
                } else resolve(undefined);
            });
        });
    }
}
