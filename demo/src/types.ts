// ---------------------------------------------------------------------------
// DocPouch RP Template — TypeScript interfaces
//
// These mirror the shapes expected by docpouch-client so you get
// autocomplete and type-checking when building payloads.
// ---------------------------------------------------------------------------

export interface DocumentContent {
    [key: string]: any;
}

export interface DocumentEntry {
    _id: string;
    title: string;
    description?: string;
    type: number;
    subType: number;
    content: DocumentContent;
    owner: string;
    shareWithGroup: boolean;
    shareWithDepartment: boolean;
    public: boolean;
}

export interface DocumentQuery {
    _id?: string;
    owner?: string;
    title?: string;
    type?: number;
    subType?: number;
    shareWithGroup?: boolean;
    shareWithDepartment?: boolean;
    public?: boolean;
}

export interface DataStructure {
    _id?: string;
    name: string;
    description: string;
    type: number;
    subType: number;
    fields: StructureField[];
}

export interface StructureField {
    name: string;
    displayName: string;
    type: string;
    items?: string;
}

export interface OidcClientConfig {
    issuer: string;
    apiBaseUrl: string;
    clientId: string;
    redirectUri: string;
    postLogoutRedirectUri: string;
    scopes: string[];
}

export interface ServerSettings {
    url: string;
    port: string;
    registrationToken: string;
}
