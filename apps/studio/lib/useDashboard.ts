"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type WorkItem = { id: string; title: string; type: string; state: string; due: string };

export type DashboardSummary = {
    hasData: boolean;
    pipeline: { draft: number; review: number; approved: number; scheduled: number; published: number };
    totals: { published30d: number; entries: number };
    activity: { id: string; person: string; role: string; action: string; target: string; type: string; at: string; authorId?: string | null; avatarUrl?: string | null; avatarStyle?: string | null }[];
    reviewQueue: { id: string; title: string; author: string; type: string; submittedAt: string }[];
    team: { userId: string; name: string; role: string; drafts: number; inReview: number; published: number }[];
    my: {
        drafts: number;
        inReview: number;
        scheduled: number;
        dueToday: number;
        published30d: number;
        publishedThisWeek: number;
        publishedLastWeek: number;
        aiGenerations: number;
        tasks: { id: string; title: string; state: string; due: string }[];
        work: {
            dueToday: WorkItem[];
            inProgress: WorkItem[];
            scheduled: WorkItem[];
        };
        recentlyPublished: { id: string; title: string; type: string; publishedAt: string }[];
        contentMix: { published: number; inReview: number; drafts: number; scheduled: number };
        insights: { wordsThisMonth: number };
        weekly: { done: number; published: number; scheduled: number; target: number; topic: string | null; streakDays: number; week: boolean[] };
    };
    calendar: { id: string; title: string; type: string; date: string; status: string }[];
};

// Module-level cache so every card on a page shares ONE fetch.
let cache: DashboardSummary | null = null;
let inflight: Promise<DashboardSummary | null> | null = null;

/** Fetch the role-aware dashboard summary once per page; returns null until loaded. */
export function useDashboardSummary(): DashboardSummary | null {
    const [data, setData] = useState<DashboardSummary | null>(cache);

    useEffect(() => {
        let alive = true;
        // Instant paint from cache (may be a previous user's), then ALWAYS revalidate
        // so a fresh login / "view as" never shows stale or someone else's data.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- cache paint, revalidated below
        if (cache) setData(cache);
        if (!inflight) {
            inflight = api<DashboardSummary>("/dashboard/summary")
                .then((d) => {
                    cache = d;
                    return d;
                })
                .catch(() => null)
                .finally(() => {
                    inflight = null;
                });
        }
        inflight.then((d) => {
            if (alive && d) setData(d);
        });
        return () => {
            alive = false;
        };
    }, []);

    return data;
}
