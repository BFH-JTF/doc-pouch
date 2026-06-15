import type {Socket} from "socket.io";
// Common type definitions for both frontend and backend
export interface I_CorsOption {
    origin: string | string[]
    allowedHeaders?: string[]
    credentials?: string
}

// API Key related types
export interface I_ApiKey {
    _id: string;
    userId: string;
    name: string;
    keyPrefix: string; // First 8 chars for identification
    keyHash: string; // bcrypt hash of the full key
    createdAt: number;
    lastUsedAt?: number;
    expiresAt?: number; // Unix timestamp, undefined = never expires
}

export interface I_ApiKeyCreate {
    name: string;
    expiresInDays?: number; // undefined = no expiry
}

export interface I_ApiKeyListItem {
    _id: string;
    name: string;
    keyPrefix: string;
    createdAt: number;
    lastUsedAt?: number;
    expiresAt?: number;
}

export interface I_ApiKeyCreated {
    key: string; // Full key, only shown once at creation
    keyPrefix: string;
    name: string;
    createdAt: number;
    expiresAt?: number;
}

// User related types

export interface I_Client {
    socket: Socket
    userid: string | null;
    isAdmin: boolean;
    lastPingSent: number;
    lastPongReceived: number;
}