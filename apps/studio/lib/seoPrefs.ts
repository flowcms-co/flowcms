"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * How SEO fixes are applied. We never silently change a live external site — the
 * difference only affects pages Flow CMS manages and how eagerly we surface the fix:
 *  - "review": generate → you review → one click to apply/copy (default, safest).
 *  - "auto":   for Flow-CMS-managed content, apply the safe fixes directly;
 *              for external audited pages, auto-copy the suggestion (still no
 *              silent push to someone else's live site).
 */
export type SeoFixMode = "review" | "auto";

const KEY = "flow.seo.fixMode";
const EVENT = "flow:seo-fixmode";

export const getSeoFixMode = (): SeoFixMode => {
    if (typeof window === "undefined") return "review";
    return localStorage.getItem(KEY) === "auto" ? "auto" : "review";
};

export const setSeoFixMode = (mode: SeoFixMode) => {
    localStorage.setItem(KEY, mode);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
};

/** Reactive accessor — stays in sync across components when the lever changes. */
export const useSeoFixMode = (): [SeoFixMode, (m: SeoFixMode) => void] => {
    const [mode, setMode] = useState<SeoFixMode>("review");

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- read client-only localStorage post-hydration
        setMode(getSeoFixMode());
        const onChange = (e: Event) => setMode((e as CustomEvent<SeoFixMode>).detail);
        window.addEventListener(EVENT, onChange);
        return () => window.removeEventListener(EVENT, onChange);
    }, []);

    const update = useCallback((m: SeoFixMode) => setSeoFixMode(m), []);
    return [mode, update];
};

// Automatic AI auditing opt-in moved to the backend: GET/PUT /ee/seo-automation
// (Pro+, gated by `seo_automation`). The studio's AI Auditor reads/writes it there
// so the EE scheduler and the UI share one source of truth.
