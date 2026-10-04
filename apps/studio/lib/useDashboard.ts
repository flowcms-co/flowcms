"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";

export type WorkItem = { id: string; title: string; type: string; state: string; due: string };

export type DashboardSummary = {
    hasData: boolean;
    /** The workspace's IANA time zone; weeks, "today" and streaks are measured in it. */
    timezone: string;
    /** Monday 00:00 of the current week in that zone. */
    weekStart: string;
    /** More than one locale is enabled: every count is per locale. */
    perLocale: boolean;
    // Workspace-wide sections are null for roles that can't publish.
    pipeline: { draft: number; review: number; approved: number; scheduled: number; published: number } | null;
    activity: { id: string; entryId: string; person: string; role: string; roleName: string; action: string; target: string; type: string; at: string; authorId?: string | null; avatarUrl?: string | null; avatarStyle?: string | null }[] | null;
    calendar: { id: string; title: string; type: string; date: string | null; status: string }[] | null;
    my: {
        drafts: number;
        awaitingReview: number;
        approved: number;
        scheduled: number;
        publishedThisWeek: number;
        publishedLastWeek: number;
        aiGenerations: number;
        work: {
            awaitingReview: WorkItem[];
            approved: WorkItem[];
            inProgress: WorkItem[];
            scheduled: WorkItem[];
        };
        recentlyPublished: { id: string; title: string; type: string; publishedAt: string; liveUrl?: string | null }[];
        contentMix: { published: number; inReview: number; approved: number; drafts: number; scheduled: number };
        insights: { wordsRecent: number };
        weekly: { done: number; published: number; scheduled: number; target: number; topic: string | null; streakDays: number; week: boolean[] };
    };
};

export type DashboardState = {
    data: DashboardSummary | null;
    /** No summary yet and none has failed: show a skeleton, not zeroes. */
    loading: boolean;
    /** The last fetch failed. With `data` set, that data is the last good copy. */
    error: boolean;
};

// Module-level cache so every card on a page shares ONE fetch. Keyed by user, so a
// different person signing in on this tab never sees the previous person's numbers.
let cache: { userId: string; data: DashboardSummary } | null = null;
let inflight: { userId: string; promise: Promise<DashboardSummary> } | null = null;

/** Forget the cached summary (tests; also safe to call on sign-out). */
export function clearDashboardCache() {
    cache = null;
    inflight = null;
}

/** The role-aware dashboard summary: paints the signed-in user's cached copy at
 *  once, always revalidates, and reports loading and failure separately from data. */
export function useDashboard(): DashboardState {
    const { user } = useAuth();
    const userId = user?.id ?? "";
    const cached = cache && cache.userId === userId ? cache.data : null;
    const [state, setState] = useState<DashboardState>({ data: cached, loading: !cached, error: false });

    useEffect(() => {
        if (!userId) return;
        let alive = true;
        const mine = cache && cache.userId === userId ? cache.data : null;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- cache paint, revalidated below
        setState({ data: mine, loading: !mine, error: false });
        if (!inflight || inflight.userId !== userId) {
            const promise = api<DashboardSummary>("/dashboard/summary")
                .then((d) => {
                    cache = { userId, data: d };
                    return d;
                })
                .finally(() => {
                    if (inflight?.promise === promise) inflight = null;
                });
            inflight = { userId, promise };
        }
        inflight.promise
            .then((d) => alive && setState({ data: d, loading: false, error: false }))
            .catch(() => alive && setState({ data: mine, loading: false, error: true }));
        return () => {
            alive = false;
        };
    }, [userId]);

    return state;
}

/** Just the data (null until loaded). Prefer useDashboard() to tell loading from failure. */
export function useDashboardSummary(): DashboardSummary | null {
    return useDashboard().data;
}
