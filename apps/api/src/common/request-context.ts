import { AsyncLocalStorage } from "node:async_hooks";
import type { Request } from "express";

/**
 * The request being handled, reachable from any service it calls (set by a
 * middleware in main.ts). The activity log reads who acted and from where here, so
 * that is not threaded through every service signature.
 */
export const requestContext = new AsyncLocalStorage<Request>();

type ReqUser = { id: string; name?: string | null; email?: string; role?: { name?: string; key?: string; permissions?: string[] } };
type ReqToken = { id: string; name: string; createdById?: string | null };

export type Actor = {
    userId: string | null;
    name: string | null;
    role: string | null;
    tokenId: string | null;
    ip: string | null;
    userAgent: string | null;
};

/** Who is acting in the current request: a signed-in user, or an API token
 *  ("City pages script (API token)"). All null outside a request (scheduler, jobs). */
export function currentActor(): Actor {
    const req = requestContext.getStore() as (Request & { user?: ReqUser; apiToken?: ReqToken }) | undefined;
    if (!req) return { userId: null, name: null, role: null, tokenId: null, ip: null, userAgent: null };
    const ua = req.headers?.["user-agent"];
    const base = { ip: req.ip ?? null, userAgent: typeof ua === "string" ? ua.slice(0, 400) : null };
    if (req.apiToken) return { ...base, userId: null, name: `${req.apiToken.name} (API token)`, role: "API token", tokenId: req.apiToken.id };
    if (req.user) return { ...base, userId: req.user.id, name: req.user.name || req.user.email || null, role: req.user.role?.name ?? null, tokenId: null };
    return { ...base, userId: null, name: null, role: null, tokenId: null };
}
