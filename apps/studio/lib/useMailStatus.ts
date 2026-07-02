"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Whether workspace email (SMTP) is connected. Mirrors the module-cache shape
 * of `useConnections` so every consumer shares one fetch. Invites, password
 * resets and alert emails silently no-op server-side until this is true, which
 * is exactly what the guided tour warns about on the Team chapter.
 */
type MailStatus = { connected: boolean };

let cache: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const subscribers = new Set<(connected: boolean) => void>();

async function fetchStatus(): Promise<boolean> {
    // A viewer without the integrations permission gets a 403; treat that the
    // same as "not connected" (those roles never see email-gated tour steps).
    const status = await api<MailStatus>("/mail/status").catch(() => null);
    const next = !!status?.connected;
    cache = next;
    subscribers.forEach((fn) => fn(next));
    return next;
}

/** Force a refetch (e.g. after connecting SMTP in settings). */
export function refreshMailStatus(): void {
    cache = null;
    inflight = fetchStatus().finally(() => {
        inflight = null;
    });
}

export function useMailStatus(): { connected: boolean; loading: boolean } {
    const [connected, setConnected] = useState<boolean>(cache ?? false);
    const [loading, setLoading] = useState(cache == null);

    useEffect(() => {
        const onUpdate = (c: boolean) => {
            setConnected(c);
            setLoading(false);
        };
        subscribers.add(onUpdate);

        if (cache != null) {
            setConnected(cache);
            setLoading(false);
        } else {
            inflight =
                inflight ??
                fetchStatus().finally(() => {
                    inflight = null;
                });
            inflight.catch(() => setLoading(false));
        }
        return () => {
            subscribers.delete(onUpdate);
        };
    }, []);

    return { connected, loading };
}
