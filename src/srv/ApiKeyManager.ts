import bcrypt from "bcrypt"
import {type I_ApiKey, type I_ApiKeyListItem, type I_ApiKeyCreated} from "../types.js";
import type {IDocStore} from "./storage/IDocStore.js";

/**
 * Manages long-lived API keys. Storage is backend-agnostic: the store is
 * injected (NeDB file, in-memory, or MongoDB) and this class only handles
 * hashing, validation, and the per-user key limit.
 */
export default class ApiKeyManager {
    saltRounds: number = 10;
    private store: IDocStore;

    constructor(store: IDocStore) {
        this.store = store;
    }

    async createApiKey(userId: string, name: string, expiresInDays?: number): Promise<I_ApiKeyCreated> {
        const existingKeys = await this.query({userId}) as I_ApiKey[];
        if (existingKeys.length >= 10) {
            throw new Error("Maximum of 10 API keys per user");
        }

        const randomBytes = Array.from({length: 32}, () => Math.floor(Math.random() * 256));
        const keyBody = randomBytes.map(b => b.toString(16).padStart(2, "0")).join("");
        const fullKey = `docpouch_key_${keyBody}`;
        const keyPrefix = keyBody.substring(0, 8);
        const keyHash = await bcrypt.hash(fullKey, this.saltRounds);

        const apiKey: I_ApiKey = {
            _id: `apikey_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
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

    stop(): void {
        this.store.stop();
    }

    private async query(query: object): Promise<I_ApiKey[]> {
        return this.store.query<I_ApiKey>(query);
    }

    private async add(inputData: I_ApiKey): Promise<I_ApiKey> {
        return this.store.add<I_ApiKey>(inputData);
    }

    private async remove(query: object): Promise<void> {
        await this.store.remove(query, {multi: true});
    }

    private async updateLastUsed(keyId: string): Promise<void> {
        await this.store.updateOne({_id: keyId}, {$set: {lastUsedAt: Date.now()}}, {multi: false, upsert: false});
    }
}