"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** A workspace element template that pages link to. `pages` is how many entries use it. */
export type SavedTemplate = {
    id: string;
    name: string;
    element: string;
    values: Record<string, unknown>;
    pages: number;
    createdAt: string;
    updatedAt: string;
};
export type UsedOn = { id: string; title: string | null; slug: string; status: string };

// One list per page load, shared by every editor and screen; reloaded after each change.
let cache: SavedTemplate[] | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();

export function reloadSavedTemplates(): Promise<void> {
    inflight = api<SavedTemplate[]>("/element-templates")
        .then((rows) => {
            cache = rows;
            subs.forEach((f) => f());
        })
        .catch(() => undefined)
        .finally(() => {
            inflight = null;
        });
    return inflight;
}

/** The saved templates, or null until loaded. Nothing is fetched unless `enabled` (the plan includes elements). */
export function useSavedTemplates(enabled: boolean): SavedTemplate[] | null {
    const [, tick] = useState(0);
    useEffect(() => {
        const f = () => tick((n) => n + 1);
        subs.add(f);
        if (enabled && cache === null && !inflight) void reloadSavedTemplates();
        return () => void subs.delete(f);
    }, [enabled]);
    return enabled ? cache : null;
}

export const pagesWord = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

/** The wording that names what a change to a template reaches. */
export const changeMessage = (name: string, n: number) =>
    n === 0 ? `No page uses “${name}” yet.` : `This changes ${pagesWord(n)} that ${n === 1 ? "uses" : "use"} “${name}”. Their public output follows the new values without a republish.`;
