import type {Socket} from "socket.io";
// Common type definitions for both frontend and backend
export interface I_CorsOption {
    origin: string | string[]
    allowedHeaders?: string[]
    credentials?: string
}


// User related types


export interface I_Client {
    socket: Socket
    userid: string | null;
    isAdmin: boolean;
    lastPingSent: number;
    lastPongReceived: number;
}