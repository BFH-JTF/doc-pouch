import Nedb from "@seald-io/nedb";
import {
    type IDocStore,
    type IRemoveOptions,
    type IUpdateOptions,
    type ICallback,
    assertPlainPayload,
    generateDocPouchId,
} from "./IDocStore.js";

// Type declaration to help TypeScript understand Nedb constructor
declare const NedbConstructor: new (options?: any) => any;
type NedbInstance = InstanceType<typeof NedbConstructor>;

/**
 * NeDB-backed implementation of {@link IDocStore}. This is the default
 * backend; it stores each collection in a single append-only file under
 * the database directory and keeps a full in-memory index.
 */
export default class NedbStore implements IDocStore {
    readonly name: string;
    readonly description: string;
    datastore: NedbInstance;

    constructor(filename: string | undefined, name: string, description: string) {
        if (!filename)
            this.datastore = new (Nedb as any)({inMemoryOnly: true, autoload: true});
        else
            this.datastore = new (Nedb as any)({filename: filename, autoload: true});
        this.name = name;
        this.description = description;
    }

    async count(query: object): Promise<number> {
        return new Promise((resolve, reject) => {
            this.datastore.count(query, (err: any, count: number) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(count);
                }
            });
        });
    }

    async add<T = any>(inputData: T): Promise<T> {
        const doc = {...(inputData as Record<string, unknown>)};
        if (doc._id === undefined || doc._id === null) {
            doc._id = generateDocPouchId();
        }
        return new Promise((resolve, reject) => {
            this.datastore.insert(doc, (err: Error | null, newDocument: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(newDocument as T);
                }
            });
        });
    }

    async insertMany(inputData: any[]): Promise<void> {
        return new Promise((resolve, reject) => {
            this.datastore.insert(inputData, (err: Error | null) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async query<T = any>(query: object): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.datastore.find(query, (err: any, newDocument: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(newDocument as T[]);
                }
            });
        });
    }

    async findOne<T = any>(query: object): Promise<T | null> {
        const results = await this.query<T>(query);
        return results.length > 0 ? results[0] : null;
    }

    async remove(query: object, options?: IRemoveOptions): Promise<number> {
        return new Promise((resolve, reject) => {
            this.datastore.remove(query, {multi: options?.multi ?? true}, (err: any, numRemoved: number) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(numRemoved);
                }
            });
        });
    }

    async update(documentID: string, updateInfo: object): Promise<number> {
        const payload: Record<string, unknown> = {...(updateInfo as Record<string, unknown>)};
        if (Object.prototype.hasOwnProperty.call(payload, "owner")) {
            return Promise.reject(new Error("Cannot update owner field"));
        }
        assertPlainPayload(payload);
        return this.updateOne({_id: documentID}, {$set: payload}, {multi: false, upsert: false, returnUpdatedDocs: true});
    }

    async updateOne(query: object, updateInfo: object, options: IUpdateOptions, callback?: ICallback<number>): Promise<number> {
        const opts = {
            multi: options.multi ?? false,
            upsert: options.upsert ?? false,
            returnUpdatedDocs: options.returnUpdatedDocs ?? true,
        };
        return new Promise((resolve, reject) => {
            this.datastore.update(query, updateInfo, opts, (err: any, numAffected: number) => {
                if (err) {
                    if (callback) callback(err, 0);
                    return reject(err);
                }
                const num = typeof numAffected === "number" ? numAffected : (numAffected as any)?.numAffected ?? 1;
                if (callback) callback(null, num);
                resolve(num);
            });
        });
    }

    async insert(inputData: any, callback?: ICallback<any>): Promise<any> {
        return new Promise((resolve, reject) => {
            this.datastore.insert(inputData, (err: Error | null, newDocument: any) => {
                if (err) {
                    if (callback) callback(err, null as any);
                    return reject(err);
                }
                if (callback) callback(null, newDocument);
                resolve(newDocument);
            });
        });
    }

    async find<T = any>(query: object, callback?: ICallback<T[]>): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.datastore.find(query, (err: any, results: any[]) => {
                if (err) {
                    if (callback) callback(err, [] as any);
                    return reject(err);
                }
                if (callback) callback(null, results as T[]);
                resolve(results as T[]);
            });
        });
    }

    async removeOne(query: object, options: IRemoveOptions, callback?: ICallback<number>): Promise<number> {
        return new Promise((resolve, reject) => {
            this.datastore.remove(query, {multi: options.multi ?? false}, (err: Error | null, numRemoved: number) => {
                if (err) {
                    if (callback) callback(err, 0);
                    return reject(err);
                }
                if (callback) callback(null, numRemoved);
                resolve(numRemoved);
            });
        });
    }

    stop(): void {
        this.datastore.stopAutocompaction();
    }

    async close(): Promise<void> {
        try {
            this.datastore.stopAutocompaction();
        } catch {
            // ignore - datastore may not expose the method
        }
    }
}