"use client";

import { useEffect } from "react";

/**
 * Stale-shell healer for the installed (Add to Home Screen) app.
 *
 * iOS standalone web apps keep their own cache that "Clear Website Data" never
 * touches, so an old shell can keep loading after a deploy even though the
 * server sends `no-store`. On mount we ask the server which build it is running
 * and, if this loaded shell is a different (older) build, reload once to pull
 * the fresh shell. A per-build sessionStorage flag prevents any reload loop if a
 * stubborn cache refuses to update.
 *
 * The request is a relative fetch to the studio's own Next server (the one that
 * served this shell), not the content API, so the build it reports matches the
 * shell being checked.
 */
const CLIENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID;

export default function VersionGate() {
    useEffect(() => {
        if (!CLIENT_BUILD) return;
        let cancelled = false;

        const check = async () => {
            try {
                const res = await fetch("/api/app-version", { cache: "no-store" });
                if (!res.ok) return;
                const { buildId } = (await res.json()) as { buildId?: string | null };
                if (cancelled || !buildId || buildId === CLIENT_BUILD) return;

                // Server is on a different build than this shell. Reload once.
                const key = `fc-reloaded-${buildId}`;
                if (sessionStorage.getItem(key)) return; // already tried; don't loop
                sessionStorage.setItem(key, "1");
                window.location.reload();
            } catch {
                // Offline or blocked: leave the current shell alone.
            }
        };

        // Check on load and again whenever the app is brought back to the
        // foreground (how a Home Screen app is usually re-opened).
        void check();
        const onVisible = () => document.visibilityState === "visible" && void check();
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return null;
}
