"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

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

/** Which status endpoints answered 403: the user's role can't read that data, which
 *  is different from the source not being connected. */
export type Forbidden = { analytics: boolean; seo: boolean; integrations: boolean };

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
let forbidden: Forbidden = { analytics: false, seo: false, integrations: false };
let fetchedAt = 0;
let inflight: Promise<Connections> | null = null;
const subscribers = new Set<(c: Connections) => void>();
const FRESH_MS = 30_000; // a mount after this revalidates, so a new connection unlocks its cards

export async function fetchConnections(): Promise<Connections> {
    const denied: Forbidden = { analytics: false, seo: false, integrations: false };
    const get = <T,>(path: string, key: keyof Forbidden) =>
        api<T>(path).catch((e) => {
            if (e instanceof ApiError && e.status === 403) denied[key] = true;
            return null;
        });
    const [analytics, connectors, ai] = await Promise.all([
        get<AnalyticsStatus>("/analytics/status", "analytics"),
        get<ConnectorsStatus>("/seo/connectors", "seo"),
        get<AiIntegration[]>("/integrations", "integrations"),
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
    forbidden = denied;
    fetchedAt = Date.now();
    subscribers.forEach((fn) => fn(next));
    return next;
}

/** Refetch in the background (after connecting or disconnecting a source). The old
 *  value stays on screen until the new one arrives. */
export function refreshConnections(): void {
    inflight =
        inflight ??
        fetchConnections().finally(() => {
            inflight = null;
        });
    inflight.catch(() => undefined);
}

export function useConnections(): { connections: Connections; loading: boolean; forbidden: Forbidden } {
    const [connections, setConnections] = useState<Connections>(cache ?? EMPTY);
    const [loading, setLoading] = useState(cache == null);

    useEffect(() => {
        const onUpdate = (c: Connections) => {
            setConnections(c);
            setLoading(false);
        };
        subscribers.add(onUpdate);

        if (cache) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from the module cache on mount
            setConnections(cache);
            setLoading(false);
            if (Date.now() - fetchedAt > FRESH_MS) refreshConnections();
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

    // Read at render: it is set together with `cache`, whose update re-renders us.
    return { connections, loading, forbidden };
}
