"use client";

import { useEffect, useRef } from "react";

/**
 * Re-run `refresh` whenever the tab becomes visible again or the window regains
 * focus. Browsers throttle (and eventually pause) `setInterval` timers in
 * background tabs, so a poll-only page can sit on stale data for a while after the
 * user switches back to it. This closes that gap: returning to the tab refreshes
 * immediately, so the data is current without a manual page reload. The interval
 * poll stays as the steady-state refresh while the tab is in the foreground.
 */
export function useRevalidateOnFocus(refresh: () => void, enabled = true) {
    // Keep the latest callback in a ref so listeners are attached once, not on
    // every render (the handler always calls the current refresh).
    const ref = useRef(refresh);
    ref.current = refresh;

    useEffect(() => {
        if (!enabled) return;
        let last = 0;
        const run = () => {
            // `focus` and `visibilitychange` often fire as a pair when switching
            // back to the tab; coalesce them so we refresh once.
            const now = Date.now();
            if (now - last < 500) return;
            last = now;
            ref.current();
        };
        const onVisible = () => {
            if (document.visibilityState === "visible") run();
        };
        window.addEventListener("focus", run);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.removeEventListener("focus", run);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [enabled]);
}
