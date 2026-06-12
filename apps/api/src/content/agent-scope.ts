import { can } from "@flowcms/shared";

/**
 * Whether a token's scopes permit a write action. Scopes are permission keys on
 * the ApiToken. An empty/absent list means unrestricted (back-compat: tokens
 * predating scoping), while a non-empty list is enforced (and "*" grants all).
 * Pure so the back-compat semantics are easily unit-tested.
 */
export function tokenScopeAllows(scopes: unknown, permission: string): boolean {
    if (!Array.isArray(scopes) || scopes.length === 0) return true;
    return can(scopes as string[], permission);
}
