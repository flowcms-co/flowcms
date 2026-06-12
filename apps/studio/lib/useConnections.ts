"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Which third-party data integrations the current workspace has connected.
 * Drives `ConnectLock` on the dashboard: a card stays locked (with a "Connect X"
 * notice) until the integration it depends on is wired up. Aggregates the three
 * existing status endpoints so cards don't each re-fetch.
 */
export type Connections = {
    gsc: boolean; // Google Search Console
    ga4: boolean; // Google Analytics 4
    pagespeed: boolean; // PageSpeed Insights
    keyword: boolean; // keyword data (DataForSEO / Serper)
    aeo: boolean; // AEO analytics provider
    backlinks: boolean; // backlinks provider
    ai: boolean; // at least one BYO AI provider key
};

const EMPTY: Connections = { gsc: false, ga4: false, pagespeed: false, keyword: false, aeo: false, backlinks: false, ai: false };

type AnalyticsStatus = { gsc?: { connected?: boolean }; ga4?: { connected?: boolean } };
type ConnectorsStatus = {
    pagespeed?: { connected?: boolean };
    keyword?: { connected?: boolean };
    aeo?: { connected?: boolean };
    backlinks?: { connected?: boolean };
};
type AiIntegration = { type?: string; status?: string };

// Module-level cache so every card/page shares one fetch (and re-mounts are instant).
let cache: Connections | null = null;
let inflight: Promise<Connections> | null = null;
const subscribers = new Set<(c: Connections) => void>();

async function fetchConnections(): Promise<Connections> {
    const [analytics, connectors, ai] = await Promise.all([
        api<AnalyticsStatus>("/analytics/status").catch(() => null),
        api<ConnectorsStatus>("/seo/connectors").catch(() => null),
        api<AiIntegration[]>("/integrations").catch(() => null),
    ]);
    const next: Connections = {
        gsc: !!analytics?.gsc?.connected,
        ga4: !!analytics?.ga4?.connected,
        pagespeed: !!connectors?.pagespeed?.connected,
        keyword: !!connectors?.keyword?.connected,
        aeo: !!connectors?.aeo?.connected,
        backlinks: !!connectors?.backlinks?.connected,
        // GET /integrations returns ALL integration types, so filter to AI providers.
        // A key counts as connected unless it is known-broken (ERROR / DISCONNECTED).
        ai:
            Array.isArray(ai) &&
            ai.some((i) => i.type === "AI_PROVIDER" && i.status !== "ERROR" && i.status !== "DISCONNECTED"),
    };
    cache = next;
    subscribers.forEach((fn) => fn(next));
    return next;
}

/** Force a refetch (e.g. after returning from the integrations settings page). */
export function refreshConnections(): void {
    cache = null;
    inflight = fetchConnections().finally(() => {
        inflight = null;
    });
}

export function useConnections(): { connections: Connections; loading: boolean } {
    const [connections, setConnections] = useState<Connections>(cache ?? EMPTY);
    const [loading, setLoading] = useState(cache == null);

    useEffect(() => {
        const onUpdate = (c: Connections) => {
            setConnections(c);
            setLoading(false);
        };
        subscribers.add(onUpdate);

        if (cache) {
            setConnections(cache);
            setLoading(false);
        } else {
            inflight =
                inflight ??
                fetchConnections().finally(() => {
                    inflight = null;
                });
            inflight.catch(() => setLoading(false));
        }
        return () => {
            subscribers.delete(onUpdate);
        };
    }, []);

    return { connections, loading };
}
