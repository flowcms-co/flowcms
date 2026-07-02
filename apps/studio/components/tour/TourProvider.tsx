"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useRole } from "@/components/providers/RoleProvider";
import { useWorkspace } from "@/lib/useWorkspace";
import { useConnections } from "@/lib/useConnections";
import { useMailStatus } from "@/lib/useMailStatus";
import {
    chapterForPath,
    chaptersForRole,
    type TourChapter,
    type TourRequirementKey,
} from "@/lib/tour";
import {
    markChapter,
    resetTourProgress,
    setTourMuted,
    useTourProgress,
    type TourProgress,
} from "@/lib/tourProgress";
import TourOverlay from "@/components/tour/TourOverlay";

type ActiveTour = { chapter: TourChapter; index: number };

type TourContextValue = {
    /** Chapters visible to the current role, steps pre-filtered. */
    chapters: TourChapter[];
    progress: TourProgress;
    active: ActiveTour | null;
    /** Live integration status keyed by requirement key. */
    connected: Record<TourRequirementKey, boolean>;
    connLoading: boolean;
    /** Start a chapter, navigating to its screen first if needed. */
    play: (chapterId: string) => void;
    next: () => void;
    back: () => void;
    /** End the tour; "done" marks the chapter finished, "skip" dismisses it. */
    close: (how: "done" | "skip") => void;
    setMuted: (muted: boolean) => void;
    restart: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
    const ctx = useContext(TourContext);
    if (!ctx) throw new Error("useTour must be used within a TourProvider");
    return ctx;
}

/**
 * Guided tour orchestrator. Watches the route: the first time the user lands on
 * a screen (per localStorage), that screen's chapter auto-plays after a short
 * beat. Chapters can also be launched from the compass in the top bar, which
 * navigates to the right screen first. Lives inside AppShell so it only exists
 * for authenticated app pages, and stays quiet until the setup wizard is done.
 */
export function TourProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { role } = useRole();
    const ws = useWorkspace();
    const progress = useTourProgress();

    const { connections, loading: connectionsLoading } = useConnections();
    const { connected: mail, loading: mailLoading } = useMailStatus();
    const connected = useMemo<Record<TourRequirementKey, boolean>>(
        () => ({ ...connections, email: mail }),
        [connections, mail],
    );

    const chapters = useMemo(() => chaptersForRole(role), [role]);

    const [active, setActive] = useState<ActiveTour | null>(null);
    // Mirror `active` into a ref so callbacks and route effects can read the
    // current value without re-subscribing on every step change.
    const activeRef = useRef<ActiveTour | null>(null);
    useEffect(() => {
        activeRef.current = active;
    }, [active]);
    /** Chapter queued from the launcher while its screen is still loading. */
    const pendingLaunch = useRef<string | null>(null);

    // Auto-play: first visit to a screen starts its chapter (unless muted, seen,
    // or the workspace hasn't finished the guided setup yet).
    useEffect(() => {
        const chapter = chapterForPath(chapters, pathname);
        if (pendingLaunch.current) {
            if (chapter && chapter.id === pendingLaunch.current) {
                pendingLaunch.current = null;
                setActive({ chapter, index: 0 });
            }
            return;
        }
        if (!chapter || activeRef.current) return;
        if (progress.muted || progress.chapters[chapter.id]) return;
        if (!ws?.onboardedAt) return;
        // A short beat lets the screen render (and its anchors mount) first.
        const t = window.setTimeout(() => setActive({ chapter, index: 0 }), 900);
        return () => window.clearTimeout(t);
    }, [pathname, chapters, progress, ws]);

    // Navigating away mid-chapter dismisses it softly (replayable later).
    useEffect(() => {
        const current = activeRef.current;
        if (!current) return;
        const here = chapterForPath(chapters, pathname);
        if (!here || here.id !== current.chapter.id) {
            markChapter(current.chapter.id, "skipped");
            setActive(null);
        }
    }, [pathname, chapters]);

    const play = useCallback(
        (chapterId: string) => {
            const chapter = chapters.find((c) => c.id === chapterId);
            if (!chapter) return;
            const here = chapterForPath(chapters, pathname);
            if (here?.id === chapter.id) {
                setActive({ chapter, index: 0 });
                return;
            }
            pendingLaunch.current = chapterId;
            router.push(chapter.launchHref ?? chapter.route);
        },
        [chapters, pathname, router],
    );

    const next = useCallback(() => {
        setActive((a) =>
            a && a.index < a.chapter.steps.length - 1 ? { ...a, index: a.index + 1 } : a,
        );
    }, []);

    const back = useCallback(() => {
        setActive((a) => (a && a.index > 0 ? { ...a, index: a.index - 1 } : a));
    }, []);

    const close = useCallback((how: "done" | "skip") => {
        const current = activeRef.current;
        if (current) markChapter(current.chapter.id, how === "done" ? "done" : "skipped");
        setActive(null);
    }, []);

    const setMuted = useCallback((muted: boolean) => setTourMuted(muted), []);

    const restart = useCallback(() => {
        resetTourProgress();
        setActive(null);
    }, []);

    const value = useMemo<TourContextValue>(
        () => ({
            chapters,
            progress,
            active,
            connected,
            connLoading: connectionsLoading || mailLoading,
            play,
            next,
            back,
            close,
            setMuted,
            restart,
        }),
        [chapters, progress, active, connected, connectionsLoading, mailLoading, play, next, back, close, setMuted, restart],
    );

    return (
        <TourContext.Provider value={value}>
            {children}
            <TourOverlay />
        </TourContext.Provider>
    );
}
