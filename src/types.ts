// Common type definitions for both frontend and backend

// User related types
export interface I_UserEntry extends I_UserCreation{
    _id: string;
}

export interface I_UserLogin {
    name: string;
    password: string;
}

export interface I_UserCreation {
    name: string;
    password: string;
    email?: string;
    isAdmin: boolean;
}

export interface I_UserUpdate {
    name?: string;
    password?: string;
    email?: string;
    isAdmin?: boolean;
}

export interface I_UserDisplay {
    _id: string;
    username: string;
    email?: string;
}

export interface I_LoginResponse {
    token: string;
    isAdmin: boolean;
}

// Document-related types
export interface I_DocumentEntry extends I_DocumentCreationOwned{
    _id: string;
}

export interface I_DocumentCreation {
    title: string;
    description?: string;
    type: number;
    subType: number;
    content: any;
}

export interface I_DocumentQuery {
    _id?: string;
    owner?: string;
    title?: string;
    type?: number;
    subType?: number;
}

export interface I_DocumentCreationOwned extends I_DocumentCreation {
    owner: string;
}

// Structure-related types
export interface I_DataStructure {
    _id?: string | undefined;
    name: string;
    description: string;
    reference?: any;
    fields: any[];
}

export interface I_StructureEntry {
    _id?: string;
    userid?: string;
    name: string;
    description: string;
    reference?: any;
    fields: any[];
}

export interface I_StructureCreation {
    name: string;
    description?: string;
    reference?: any;
    fields: any[];
}

// Websocket-related types
export interface I_WsServerMessage {
    type: "ping" | "update" | "error";
    error?: string;
    update?: I_DocumentEntry;
}

export interface I_WsClientMessage {
    token: string;
    action: "subscribe" | "unsubscribe" | "pong";
}