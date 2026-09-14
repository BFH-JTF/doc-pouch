import {Collection, Db, MongoClient} from "mongodb";
import {
    type IDocStore,
    type IRemoveOptions,
    type IUpdateOptions,
    type ICallback,
    assertPlainPayload,
    generateDocPouchId,
} from "./IDocStore.js";

/**
 * Shared MongoClient + Db handle. One client is created per process and
 * every {@link MongoStore} draws its {@link Collection} from it, mirroring
 * how the NeDB backend creates one file per collection.
 */
export class MongoDbHandle {
    private static client: MongoClient | null = null;
    private static db: Db | null = null;
    private static uri = "";
    private static dbName = "";
    private static connecting: Promise<Db> | null = null;

    static async connect(uri: string, dbName: string): Promise<Db> {
        if (MongoDbHandle.db && MongoDbHandle.uri === uri && MongoDbHandle.dbName === dbName) {
            return MongoDbHandle.db;
        }
        if (MongoDbHandle.connecting && MongoDbHandle.uri === uri && MongoDbHandle.dbName === dbName) {
            return MongoDbHandle.connecting;
        }
        if (MongoDbHandle.client) {
            await MongoDbHandle.client.close().catch(() => undefined);
            MongoDbHandle.client = null;
            MongoDbHandle.db = null;
        }
        MongoDbHandle.connecting = (async () => {
            const client = new MongoClient(uri);
            await client.connect();
            MongoDbHandle.client = client;
            MongoDbHandle.db = client.db(dbName);
            return MongoDbHandle.db;
        })();
        try {
            const db = await MongoDbHandle.connecting;
            MongoDbHandle.uri = uri;
            MongoDbHandle.dbName = dbName;
            return db;
        } finally {
            MongoDbHandle.connecting = null;
        }
    }

    static getDb(): Db {
        if (!MongoDbHandle.db) {
            throw new Error("MongoDbHandle not connected. Call MongoDbHandle.connect() first.");
        }
        return MongoDbHandle.db;
    }

    /**
     * Await the connection when it is (re)establishing. Stores call this
     * instead of the throwing `getDb()` so that a `close()` followed by
     * new operations reconnects gracefully instead of hard-failing.
     * Returns null when no connection was ever configured.
     */
    static async getConnectedDb(): Promise<Db | null> {
        if (MongoDbHandle.db && MongoDbHandle.client) {
            return MongoDbHandle.db;
        }
        if (MongoDbHandle.connecting) {
            await MongoDbHandle.connecting.catch(() => undefined);
            return MongoDbHandle.db;
        }
        if (MongoDbHandle.uri && MongoDbHandle.dbName) {
            // Reconnect after a close() using the remembered parameters.
            try {
                return await MongoDbHandle.connect(MongoDbHandle.uri, MongoDbHandle.dbName);
            } catch {
                return null;
            }
        }
        return null;
    }

    static isConnected(): boolean {
        return MongoDbHandle.client !== null;
    }

    static async close(): Promise<void> {
        if (MongoDbHandle.client) {
            await MongoDbHandle.client.close();
            MongoDbHandle.client = null;
            MongoDbHandle.db = null;
        }
    }
}

/**
 * MongoDB-backed implementation of {@link IDocStore}.
 *
 * Semantics are aligned with the NeDB backend rather than with native
 * MongoDB wherever the two differ, because DocPouch's higher layers were
 * written against NeDB behavior (see {@link IDocStore.updateOne} for the
 * load-bearing upsert quirk).
 *
 * Documents keep 16-char alphanumeric string `_id`s so exports, imports,
 * and cross-document references work identically on both backends.
 */
export default class MongoStore implements IDocStore {
    readonly name: string;
    readonly description: string;
    private collectionName: string;
    private collection: Collection | null = null;

    constructor(collectionName: string, name: string, description: string) {
        this.collectionName = collectionName;
        this.name = name;
        this.description = description;
    }

    /**
     * Resolve the Mongo collection lazily, reconnecting when the shared
     * handle was closed (e.g. a previous test suite's `stop()` closed the
     * client). Throws when no connection can be established.
     */
    private async getCollection(): Promise<Collection> {
        if (!this.collection) {
            const db = await MongoDbHandle.getConnectedDb();
            if (!db) {
                throw new Error("MongoDbHandle not connected. Call MongoDbHandle.connect() first.");
            }
            this.collection = db.collection(this.collectionName);
        }
        return this.collection;
    }

    /**
     * Create the indexes DocPouch relies on. Called once per collection
     * name at startup (idempotent).
     */
    static async ensureIndexes(db: Db, collectionName: string): Promise<void> {
        const collection = db.collection(collectionName);
        switch (collectionName) {
            case "users":
                await collection.createIndex({name: 1}, {unique: true});
                await collection.createIndex({email: 1});
                break;
            case "documents":
                await collection.createIndex({owner: 1});
                await collection.createIndex({type: 1, subType: 1});
                break;
            case "structures":
                await collection.createIndex({name: 1});
                await collection.createIndex({type: 1, subType: 1});
                break;
            case "anonymousStructures":
                await collection.createIndex({type: 1, subType: 1}, {unique: true});
                break;
            case "apiKeys":
                await collection.createIndex({userId: 1});
                break;
            case "passwordResetTokens":
                await collection.createIndex({token: 1}, {unique: true});
                await collection.createIndex({expiresAt: 1}, {expireAfterSeconds: 0});
                break;
            case "oidc_Session":
            case "oidc_AccessToken":
            case "oidc_AuthorizationCode":
            case "oidc_RefreshToken":
            case "oidc_ClientCredentials":
            case "oidc_Client":
            case "oidc_InitialAccessToken":
            case "oidc_RegistrationAccessToken":
            case "oidc_DeviceCode":
            case "oidc_BackchannelAuthenticationRequest":
            case "oidc_PushedAuthorizationRequest":
            case "oidc_ReplayDetection":
            case "oidc_Grant":
            case "oidc_Interaction":
            case "oidc_ResourceServer":
                await collection.createIndex({uid: 1});
                await collection.createIndex({userCode: 1});
                await collection.createIndex({grantId: 1});
                await collection.createIndex({expiresAt: 1}, {expireAfterSeconds: 0});
                break;
            default:
                break;
        }
    }

    async count(query: object): Promise<number> {
        return (await this.getCollection()).countDocuments(this.translateQuery(query));
    }

    async add<T = any>(inputData: T): Promise<T> {
        const doc = {...(inputData as Record<string, unknown>)};
        if (doc._id === undefined || doc._id === null) {
            doc._id = generateDocPouchId();
        }
        const result = await (await this.getCollection()).insertOne(doc as any);
        return {...(doc as object), _id: result.insertedId} as T;
    }

    async insertMany(inputData: any[]): Promise<void> {
        if (inputData.length === 0) return;
        const docs = inputData.map((d) => {
            const doc = {...d};
            if (doc._id === undefined || doc._id === null) {
                doc._id = generateDocPouchId();
            }
            return doc;
        });
        await (await this.getCollection()).insertMany(docs);
    }

    async query<T = any>(query: object): Promise<T[]> {
        return (await this.getCollection()).find(this.translateQuery(query)).toArray() as Promise<T[]>;
    }

    async findOne<T = any>(query: object): Promise<T | null> {
        const doc = await (await this.getCollection()).findOne(this.translateQuery(query));
        return (doc as T) ?? null;
    }

    async remove(query: object, options?: IRemoveOptions): Promise<number> {
        const translated = this.translateQuery(query);
        if (options?.multi === false) {
            const result = await (await this.getCollection()).deleteOne(translated);
            return result.deletedCount;
        }
        const result = await (await this.getCollection()).deleteMany(translated);
        return result.deletedCount;
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
        const translated = this.translateQuery(query);
        const opts = {
            multi: options.multi ?? false,
            upsert: options.upsert ?? false,
        };
        try {
            if (opts.upsert) {
                // NeDB semantics: an upsert that matches nothing inserts the
                // *update* document as-is (when it is a plain object) or the
                // query document modified by the operators (when it is an
                // operator document). Native Mongo upsert would insert the
                // query's fields too — including `_id` — which the OIDC
                // adapter relies on NOT happening in some flows (the
                // update doc differs from the query doc), so we replicate
                // NeDB explicitly: probe first, then insert or update.
                const existing = await (await this.getCollection()).findOne(translated);
                if (existing === null) {
                    const toBeInserted = this.buildUpsertDoc(query, updateInfo);
                    try {
                        await (await this.getCollection()).insertOne(toBeInserted);
                        const num = 1;
                        if (callback) callback(null, num);
                        return num;
                    } catch (err: any) {
                        // Race with a concurrent insert of the same doc:
                        // fall through to the update path below.
                        if (err?.code !== 11000 && err?.code !== 11001 /* not a duplicate key */) {
                            if (callback) callback(err as Error, 0);
                            throw err;
                        }
                    }
                }
            }
            const isOperatorDoc = Object.keys(updateInfo as Record<string, unknown>).some((k) => k.startsWith("$"));
            const updatePayload = isOperatorDoc ? updateInfo : {$set: updateInfo};
            if (opts.multi) {
                const result = await (await this.getCollection()).updateMany(translated, updatePayload as any);
                const num = result.modifiedCount + result.upsertedCount;
                if (callback) callback(null, num);
                return num;
            }
            const result = await (await this.getCollection()).updateOne(translated, updatePayload as any);
            const num = result.matchedCount > 0 ? Math.max(result.modifiedCount, result.matchedCount) : result.upsertedCount;
            if (callback) callback(null, num);
            return num;
        } catch (err) {
            if (callback) callback(err as Error, 0);
            throw err;
        }
    }

    /**
     * Build the document an upsert inserts when no match was found,
     * following NeDB's rules (see @seald-io/nedb `_updateAsync`):
     *  - plain update object → inserted as-is (query fields are NOT merged)
     *  - operator update object → deep copy of the query with the operators
     *    applied
     */
    private buildUpsertDoc(query: object, updateInfo: object): Record<string, any> {
        const isOperatorDoc = Object.keys(updateInfo as Record<string, unknown>).some((k) => k.startsWith("$"));
        if (!isOperatorDoc) {
            const doc = this.deepCopy(updateInfo) as Record<string, any>;
            if (doc._id === undefined) {
                doc._id = generateDocPouchId();
            }
            return doc;
        }
        const base = this.deepCopy(this.stripQueryOperators(query)) ?? {};
        const result = this.applyOperators(base, updateInfo as Record<string, any>);
        if (result._id === undefined) {
            result._id = generateDocPouchId();
        }
        return result;
    }

    /**
     * Structured deep copy that tolerates `undefined` values (NeDB's
     * deepCopy keeps them; JSON round-trips would drop or crash on them).
     * oidc-provider payloads frequently contain `undefined` properties.
     */
    private deepCopy<T>(value: T): T {
        if (value === null || typeof value !== "object") {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map((v) => this.deepCopy(v)) as unknown as T;
        }
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = this.deepCopy(v);
        }
        return out as unknown as T;
    }

    /**
     * DocPouch only issues plain-equality queries. Strip any operator
     * keys defensively before using a query as an upsert base.
     */
    private stripQueryOperators(query: object): Record<string, any> {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
            if (k.startsWith("$")) continue;
            out[k] = v;
        }
        return out;
    }

    /**
     * Apply a (small) subset of Mongo update operators to a base document:
     * `$set`, `$unset`, `$inc`, `$push`, `$addToSet`, `$pull`. This is only
     * used on the upsert-insert path, where NeDB's behavior must be
     * replicated.
     */
    private applyOperators(base: Record<string, any>, operators: Record<string, any>): Record<string, any> {
        for (const [op, spec] of Object.entries(operators)) {
            switch (op) {
                case "$set":
                    for (const [k, v] of Object.entries(spec)) {
                        this.setPath(base, k, this.deepCopy(v));
                    }
                    break;
                case "$unset":
                    for (const k of Object.keys(spec)) {
                        delete base[k];
                    }
                    break;
                case "$inc":
                    for (const [k, v] of Object.entries(spec)) {
                        base[k] = (typeof base[k] === "number" ? base[k] : 0) + (v as number);
                    }
                    break;
                case "$push":
                    for (const [k, v] of Object.entries(spec)) {
                        if (!Array.isArray(base[k])) base[k] = [];
                        base[k].push(this.deepCopy(v));
                    }
                    break;
                case "$addToSet":
                    for (const [k, v] of Object.entries(spec)) {
                        if (!Array.isArray(base[k])) base[k] = [];
                        if (!base[k].some((item: any) => JSON.stringify(item) === JSON.stringify(v))) {
                            base[k].push(this.deepCopy(v));
                        }
                    }
                    break;
                case "$pull":
                    for (const [k, v] of Object.entries(spec)) {
                        if (!Array.isArray(base[k])) break;
                        base[k] = base[k].filter(
                            (item: any) => !(typeof v === "object" && v !== null
                                ? Object.entries(v).every(([fk, fv]) => item?.[fk] === fv)
                                : item === v));
                    }
                    break;
                default:
                    // Unknown operator on the upsert path: ignore, matching
                    // NeDB's modify() error tolerance is not required here
                    // since DocPouch only uses $set on this path.
                    break;
            }
        }
        return base;
    }

    private setPath(obj: Record<string, any>, dottedPath: string, value: any): void {
        const parts = dottedPath.split(".");
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof current[parts[i]] !== "object" || current[parts[i]] === null) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
    }

    async insert(inputData: any, callback?: ICallback<any>): Promise<any> {
        try {
            const doc = await this.add(inputData);
            if (callback) callback(null, doc);
            return doc;
        } catch (err) {
            if (callback) callback(err as Error, null as any);
            throw err;
        }
    }

    async find<T = any>(query: object, callback?: ICallback<T[]>): Promise<T[]> {
        try {
            const results = await this.query<T>(query);
            if (callback) callback(null, results);
            return results;
        } catch (err) {
            if (callback) callback(err as Error, [] as any);
            throw err;
        }
    }

    async removeOne(query: object, options: IRemoveOptions, callback?: ICallback<number>): Promise<number> {
        try {
            const num = await this.remove(query, options);
            if (callback) callback(null, num);
            return num;
        } catch (err) {
            if (callback) callback(err as Error, 0);
            throw err;
        }
    }

    /**
     * DocPouch issues plain-equality queries where a `null`/`undefined`
     * field value must match documents that lack the field (NeDB treats a
     * missing field as `null` for matching purposes in its `model.match`).
     * MongoDB's native equality semantics differ (`{field: null}` matches
     * missing OR null, but `{field: value}` does not match missing), so no
     * translation is needed for the queries DocPouch actually builds.
     * Reserved for future operator translation if the query surface grows.
     */
    private translateQuery(query: object): Record<string, any> {
        return query as Record<string, any>;
    }

    stop(): void {
        // No background compaction to stop for MongoDB.
    }

    async close(): Promise<void> {
        // Connection lifecycle is owned by MongoDbHandle.
    }
}