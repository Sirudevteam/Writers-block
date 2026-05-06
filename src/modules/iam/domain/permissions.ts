type OrgRole = "owner" | "admin" | "member" | "billing"

/**
 * App-level permissions. Keep this list stable; store as strings in audit logs.
 * (SSO/SCIM not implemented yet.)
 */
export type Permission =
  | "org:read"
  | "org:member:read"
  | "org:member:invite"
  | "org:member:manage"
  | "org:security:read"
  | "org:security:manage"
  | "project:read"
  | "project:write"
  | "billing:read"
  | "billing:manage"
  | "audit:read"
  | "platform:admin"

const ROLE_PERMISSIONS: Record<OrgRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    "org:read",
    "org:member:read",
    "org:member:invite",
    "org:member:manage",
    "org:security:read",
    "org:security:manage",
    "project:read",
    "project:write",
    "billing:read",
    "billing:manage",
    "audit:read",
  ]),
  admin: new Set<Permission>([
    "org:read",
    "org:member:read",
    "org:member:invite",
    "org:member:manage",
    "org:security:read",
    "project:read",
    "project:write",
    "billing:read",
    "audit:read",
  ]),
  member: new Set<Permission>([
    "org:read",
    "org:member:read",
    "project:read",
    "project:write",
  ]),
  billing: new Set<Permission>([
    "org:read",
    "org:member:read",
    "billing:read",
  ]),
}

export function roleHasPermission(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}
