/**
 * Optional hook that lets the core content engine apply a role's field-level
 * permissions WITHOUT depending on the commercial `ee/` code. The EE
 * `advanced_rbac` module provides this port; in Community it's absent and the
 * engine applies no restrictions. Implementations must no-op (return everything)
 * unless the install is licensed for `advanced_rbac`.
 */
export const RBAC_PORT = "RBAC_PORT";

/** The subset of a role the field-permission rules read. */
export type RoleRules = { lockSeoMeta?: boolean; allowedTypeIds?: string[] };

export interface RbacPort {
    /** Content-type ids the role may access, or `null` = unrestricted (unlicensed / no rule set). */
    allowedTypeIds(role: RoleRules): Promise<string[] | null>;
    /** Drop fields the role may not write (SEO / metadata) from a create/update payload. */
    stripLockedFields(role: RoleRules, data: Record<string, unknown>): Promise<Record<string, unknown>>;
}
