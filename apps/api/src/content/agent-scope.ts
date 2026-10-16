import { OPT_IN_TOKEN_SCOPES, can } from "@flowcms/shared";

/**
 * Whether a token's scopes permit an action. Scopes are permission keys on the
 * ApiToken. An empty/absent list means unrestricted (back-compat: tokens predating
 * scoping), while a non-empty list is enforced (and "*" grants all), except for
 * the opt-in scopes (restore, media), which a token has only when they are listed.
 * Pure so the semantics are easily unit-tested.
 */
export function tokenScopeAllows(scopes: unknown, permission: string): boolean {
    if ((OPT_IN_TOKEN_SCOPES as readonly string[]).includes(permission)) return Array.isArray(scopes) && scopes.includes(permission);
    if (!Array.isArray(scopes) || scopes.length === 0) return true;
    return can(scopes as string[], permission);
}
