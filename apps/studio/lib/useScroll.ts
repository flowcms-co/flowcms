"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Keeps list views from "jumping" when a filter, tab, or page control changes
 * the content (and therefore the page height).
 *
 * When a filtered list shrinks while the user is scrolled down, the browser
 * abruptly clamps the scroll position upward — a jarring lurch. This hook
 * smooth-scrolls `ref` (a marker placed at the top of the list/results) to the
 * top of the viewport whenever `key` changes, *after* the first render — so the
 * list resolves to a stable, intentional position instead of clamping. Browsers
 * honor `prefers-reduced-motion` for smooth scrolls automatically.
 *
 * Pass a `key` that changes only on discrete actions (a filter / tab / page
 * value) — NOT on every keystroke of a search box, or it would scroll mid-type.
 */
export function useScrollResetOnChange(ref: RefObject<HTMLElement | null>, key: unknown) {
    // Seed with the first `key` so the initial mount never scrolls — and crucially,
    // so React StrictMode's double-invoked effect in dev doesn't either (a plain
    // "skip first render" boolean fails there: the first pass consumes the flag and
    // the second pass scrolls on load). We only scroll on a *genuine* change of
    // `key` (a filter / tab / page switch).
    const prevKey = useRef<unknown>(key);
    useEffect(() => {
        if (Object.is(prevKey.current, key)) return;
        prevKey.current = key;
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [ref, key]);
}
