import Nedb from "@seald-io/nedb";
import path from "path";
import fs from "fs";

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
    for (const model of OIDC_MODELS) {
        getDatastore(model);
    }
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
            this.datastore.update({_id: id}, {$set: doc}, {upsert: true}, (err: Error | null) => {
                if (err) reject(err);
                else resolve(undefined);
            });
        });
    }

    find(id: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.findOne({_id: id}, (err: Error | null, doc: any) => {
                if (err) reject(err);
                else resolve(doc || undefined);
            });
        });
    }

    findByUid(uid: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.findOne({uid}, (err: Error | null, doc: any) => {
                if (err) reject(err);
                else resolve(doc || undefined);
            });
        });
    }

    findByUserCode(userCode: string): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.findOne({userCode}, (err: Error | null, doc: any) => {
                if (err) reject(err);
                else resolve(doc || undefined);
            });
        });
    }

    destroy(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.datastore.remove({_id: id}, {}, (err: Error | null) => {
                if (err) reject(err);
                else resolve(undefined);
            });
        });
    }

    revokeByGrantId(grantId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.datastore.remove({grantId}, {multi: true}, (err: Error | null) => {
                if (err) reject(err);
                else resolve(undefined);
            });
        });
    }

    consume(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.datastore.update({_id: id}, {$set: {consumed: true}}, {}, (err: Error | null) => {
                if (err) reject(err);
                else resolve(undefined);
            });
        });
    }
}
