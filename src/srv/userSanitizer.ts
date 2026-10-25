/**
 * Shared helpers for stripping password hashes from user records before
 * they cross a trust boundary (REST responses, WebSocket events, MCP tool
 * results). Mirrors the stripping the MCP tools already perform, so REST
 * and MCP expose the same shape (#112).
 */
export function stripUserPassword<T>(user: T): T {
    const {password: _password, ...rest} = user as Record<string, unknown>;
    return rest as T;
}

export function stripUserPasswords<T>(users: T[]): T[] {
    return users.map(user => (user && typeof user === 'object' ? stripUserPassword(user) : user));
}

/**
 * Strips password hashes from the `users` collection of a database export
 * payload, leaving all other collections untouched.
 */
export function stripUserPasswordsFromExport<T extends {users?: unknown[]}>(data: T): T {
    if (data.users) {
        data.users = stripUserPasswords(data.users);
    }
    return data;
}