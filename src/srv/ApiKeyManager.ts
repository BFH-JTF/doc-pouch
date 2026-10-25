import bcrypt from "bcrypt"
import Nedb from "@seald-io/nedb";
import crypto from "crypto";
import {type I_ApiKey, type I_ApiKeyListItem, type I_ApiKeyCreated} from "../types.js";

declare const NedbConstructor: new (options?: any) => any;
type NedbInstance = InstanceType<typeof NedbConstructor>;

export default class ApiKeyManager {
    saltRounds: number = 10;
    private datastore: NedbInstance;

    constructor(filename: string | undefined) {
        if (!filename) {
            this.datastore = new (Nedb as any)({inMemoryOnly: true, autoload: true});
        } else {
            this.datastore = new (Nedb as any)({filename: filename, autoload: true});
        }
        this.datastore.setAutocompactionInterval(1000 * 60 * 60);
    }

    async createApiKey(userId: string, name: string, expiresInDays?: number): Promise<I_ApiKeyCreated> {
        const existingKeys = await this.query({userId}) as I_ApiKey[];
        if (existingKeys.length >= 10) {
            throw new Error("Maximum of 10 API keys per user");
        }

        // #109: API keys are the only bearer credential for the API, so the
        // key material must come from a CSPRNG. Math.random() is a
        // predictable PRNG whose state can be recovered from observed
        // output, which would allow predicting other users' keys.
        const keyBody = crypto.randomBytes(32).toString("hex");
        const fullKey = `docpouch_key_${keyBody}`;
        const keyPrefix = keyBody.substring(0, 8);
        const keyHash = await bcrypt.hash(fullKey, this.saltRounds);

        const apiKey: I_ApiKey = {
            _id: `apikey_${Date.now()}_${crypto.randomUUID()}`,
            userId,
            name,
            keyPrefix,
            keyHash,
            createdAt: Date.now(),
            expiresAt: expiresInDays ? Date.now() + (expiresInDays * 24 * 60 * 60 * 1000) : undefined,
        };

        await this.add(apiKey);

        return {
            key: fullKey,
            keyPrefix,
            name,
            createdAt: apiKey.createdAt,
            expiresAt: apiKey.expiresAt,
        };
    }

    async listApiKeys(userId: string): Promise<I_ApiKeyListItem[]> {
        const keys = await this.query({userId}) as I_ApiKey[];
        return keys.map(k => ({
            _id: k._id,
            name: k.name,
            keyPrefix: k.keyPrefix,
            createdAt: k.createdAt,
            lastUsedAt: k.lastUsedAt,
            expiresAt: k.expiresAt,
        }));
    }

    async verifyApiKey(fullKey: string): Promise<{ userId: string; keyId: string } | null> {
        if (!fullKey.startsWith("docpouch_key_")) {
            return null;
        }

        const keys = await this.query({}) as I_ApiKey[];
        for (const key of keys) {
            if (key.expiresAt && key.expiresAt < Date.now()) {
                continue;
            }
            const match = await bcrypt.compare(fullKey, key.keyHash);
            if (match) {
                await this.updateLastUsed(key._id);
                return {userId: key.userId, keyId: key._id};
            }
        }
        return null;
    }

    async deleteApiKey(keyId: string, userId: string): Promise<boolean> {
        const key = await this.query({_id: keyId, userId}) as I_ApiKey[];
        if (key.length === 0) {
            return false;
        }
        await this.remove({_id: keyId});
        return true;
    }

    async deleteAllForUser(userId: string): Promise<number> {
        const keys = await this.query({userId}) as I_ApiKey[];
        for (const key of keys) {
            await this.remove({_id: key._id});
        }
        return keys.length;
    }

    async getApiKey(keyId: string): Promise<I_ApiKey | null> {
        const keys = await this.query({_id: keyId}) as I_ApiKey[];
        return keys.length > 0 ? keys[0] : null;
    }

    stopAutocompaction(): void {
        this.datastore.stopAutocompaction();
    }

    private async query(query: object): Promise<I_ApiKey[]> {
        return new Promise((resolve, reject) => {
            this.datastore.find(query, (err: any, result: I_ApiKey[]) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    private async add(inputData: I_ApiKey): Promise<I_ApiKey> {
        return new Promise((resolve, reject) => {
            this.datastore.insert(inputData, (err: Error | null, newDoc: I_ApiKey) => {
                if (err) reject(err);
                else resolve(newDoc);
            });
        });
    }

    private async remove(query: object): Promise<void> {
        return new Promise((resolve, reject) => {
            this.datastore.remove(query, {}, (err: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    private async updateLastUsed(keyId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.datastore.update(
                {_id: keyId},
                {$set: {lastUsedAt: Date.now()}},
                {multi: false, upsert: false},
                (err: any) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
}
