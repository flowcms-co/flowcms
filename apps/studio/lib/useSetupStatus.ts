"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type SetupStatus = {
    /** True once a super admin exists — the instance has been claimed. */
    claimed: boolean;
    /** Configured public hostname (STUDIO_URL), shown read-only in the wizard. */
    hostname: string | null;
};

// Module-level cache + a subscriber set so EVERY mounted consumer updates when the
// status changes — critical because the first-run gate is mounted once at the app
// root: without notifications it would keep a stale `claimed:false` after the claim
// and bounce /login <-> /welcome forever.
let cache: SetupStatus | null = null;
let inflight: Promise<SetupStatus> | null = null;
const subscribers = new Set<(s: SetupStatus) => void>();

function fetchStatus(): Promise<SetupStatus> {
    if (!inflight) {
        inflight = api<SetupStatus>("/setup/status")
            .then((s) => {
                cache = s;
                subscribers.forEach((fn) => fn(s));
                return s;
            })
            .catch((e) => {
                inflight = null; // allow a retry on the next mount
                throw e;
            });
    }
    return inflight;
}

/** Fetch the first-run setup status (module-cached). Returns null until loaded, and
 *  re-renders when the cached status is updated (claim) or invalidated. */
export function useSetupStatus(): SetupStatus | null {
    const [status, setStatus] = useState<SetupStatus | null>(cache);

    useEffect(() => {
        subscribers.add(setStatus);
        if (cache) setStatus(cache);
        else void fetchStatus().then(setStatus).catch(() => {});
        return () => {
            subscribers.delete(setStatus);
        };
    }, []);

    return status;
}

/** Push a known status to every mounted consumer synchronously — used right after a
 *  successful claim so the first-run gate sees `claimed:true` immediately, with no
 *  refetch race that could bounce the user back to /welcome. */
export function setSetupStatus(next: SetupStatus) {
    cache = next;
    inflight = Promise.resolve(next);
    subscribers.forEach((fn) => fn(next));
}

/** Invalidate + refetch, notifying all mounted consumers when it resolves. */
export function clearSetupStatusCache() {
    cache = null;
    inflight = null;
    void fetchStatus().catch(() => {});
}
