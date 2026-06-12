"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** A workspace the signed-in user belongs to (for the switcher). */
export type WorkspaceSummary = {
    id: string;
    name: string;
    slug: string;
    role: { key: string; name: string };
    active: boolean;
};

// Module-level cache so the switcher doesn't refetch on every mount (mirrors
// useWorkspace). Cleared on switch — a switch hard-reloads the app anyway.
let cache: WorkspaceSummary[] | null = null;

/** The workspaces the current user can switch between, and which one is active. */
export function useWorkspaces() {
    const [list, setList] = useState<WorkspaceSummary[] | null>(cache);

    useEffect(() => {
        if (cache) return;
        let off = false;
        // setState runs after the awaited fetch (not synchronously) — the intended
        // pattern for syncing from the external API.
        api<WorkspaceSummary[]>("/workspaces")
            .then((ws) => {
                cache = ws;
                if (!off) setList(ws);
            })
            .catch(() => {});
        return () => {
            off = true;
        };
    }, []);

    return {
        workspaces: list ?? [],
        active: (list ?? []).find((w) => w.active) ?? null,
        loading: list === null,
    };
}

/**
 * Point the session at another workspace, then hard-reload to the dashboard so
 * every module cache + open view refetches under the new tenant (the current
 * route's ids belong to the old workspace, so we don't try to keep it).
 */
export async function switchWorkspace(id: string): Promise<void> {
    await api("/workspaces/switch", { method: "POST", body: JSON.stringify({ workspaceId: id }) });
    cache = null;
    window.location.assign("/");
}

export function clearWorkspacesCache() {
    cache = null;
}
