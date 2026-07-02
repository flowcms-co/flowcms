"use client";

import { useSyncExternalStore } from "react";

export type ChapterState = "done" | "skipped";

export type TourProgress = {
    /** Per-chapter outcome; a chapter absent from the map hasn't been seen yet. */
    chapters: Record<string, ChapterState>;
    /** True once the user turns auto-play off (chapters then only start from the launcher). */
    muted: boolean;
};

/**
 * Guided-tour progress, persisted in localStorage (same hydration-safe pattern
 * as the sidebar collapse pref in AppShell): the server snapshot is a stable
 * empty value, so the first client render matches SSR and React re-reads the
 * real value after hydration. A custom event syncs same-tab updates; the
 * native `storage` event syncs across tabs.
 */
const KEY = "flow-tour-v1";
const CHANGE_EVENT = "flow-tour-change";
const EMPTY: TourProgress = { chapters: {}, muted: false };

let cache: TourProgress | null = null;

function read(): TourProgress {
    if (cache) return cache;
    try {
        const raw = window.localStorage.getItem(KEY);
        cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<TourProgress>) } : EMPTY;
    } catch {
        cache = EMPTY;
    }
    return cache;
}

function write(next: TourProgress) {
    cache = next;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        // ignore storage failures (private mode, etc.)
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function markChapter(id: string, state: ChapterState): void {
    const p = read();
    // Never demote a finished chapter to skipped (e.g. closing a replay early).
    if (p.chapters[id] === "done" && state === "skipped") return;
    write({ ...p, chapters: { ...p.chapters, [id]: state } });
}

export function setTourMuted(muted: boolean): void {
    write({ ...read(), muted });
}

/** Wipe all chapter progress (keeps auto-play preference). */
export function resetTourProgress(): void {
    write({ ...read(), chapters: {} });
}

const subscribe = (cb: () => void) => {
    // Another tab wrote: drop the cache so the next snapshot re-reads storage.
    const onStorage = () => {
        cache = null;
        cb();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, cb);
    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(CHANGE_EVENT, cb);
    };
};

export function useTourProgress(): TourProgress {
    return useSyncExternalStore(subscribe, read, () => EMPTY);
}
