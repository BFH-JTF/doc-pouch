// Role model of DocPouch.
//
// Every user has one role. The roles are ordered; a higher role includes all
// rights of the lower ones:
//
//   member      may read and write documents (as before)
//   manager     may additionally create documents of structures that the
//               super-admin has protected with minRole "manager"
//   admin       may additionally create, change and remove structures and
//               documents of structures protected with minRole "admin"
//   superadmin  everything, including users, roles, protection rules and the
//               database (export/import). Users with isAdmin = true are
//               super-admins, so existing installations keep working.
//
// Which structures are protected, and with which role, is configured at
// runtime (protected-structure rules) – nothing application-specific is
// built into the server.

export const ROLES = ["member", "manager", "admin", "superadmin"] as const;
export type Role = typeof ROLES[number];

// Roles that can be stored on a user. "superadmin" is expressed by isAdmin.
export const ASSIGNABLE_ROLES = ["member", "manager", "admin"] as const;
export type AssignableRole = typeof ASSIGNABLE_ROLES[number];

export function isRole(value: unknown): value is Role {
    return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isAssignableRole(value: unknown): value is AssignableRole {
    return typeof value === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

export function roleRank(role: Role): number {
    return ROLES.indexOf(role);
}

// Effective role of a stored user record (isAdmin wins, unknown values fall back to member)
export function effectiveRole(user: { isAdmin?: boolean; role?: unknown } | null | undefined): Role {
    if (!user) return "member";
    if (user.isAdmin) return "superadmin";
    return isAssignableRole(user.role) ? user.role : "member";
}

export function hasRole(actual: Role, required: Role): boolean {
    return roleRank(actual) >= roleRank(required);
}

export interface I_ProtectedStructureEntry {
    _id?: string;
    type: number;
    subType: number;
    // Lowest role that may create, change or remove documents of this structure
    minRole: Exclude<Role, "member">;
}
