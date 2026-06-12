"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";

export type Notif = {
    id: string;
    type: string;
    title: string;
    body: string | null;
    href: string | null;
    read: boolean;
    createdAt: string;
};

/** Notification type → icon + accent color (matches the live event types). */
export const notifMeta: Record<string, { icon: string; color: string }> = {
    review_requested: { icon: "clock", color: "#F5A623" },
    approved: { icon: "check", color: "#00B894" },
    published: { icon: "check", color: "#00B894" },
    scheduled: { icon: "calendar", color: "#3B82F6" },
    generated: { icon: "sparkles", color: "#A29BFE" },
};
export const metaFor = (type: string) => notifMeta[type] ?? { icon: "bell", color: "#6C5CE7" };

export const relTime = (iso: string) => {
    const s = Math.floor((Date.now() - +new Date(iso)) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d === 1 ? "yesterday" : `${d}d ago`;
};

/** Live notifications with polling + optimistic mark-as-read. */
export function useNotifications(pollMs = 20000) {
    const [items, setItems] = useState<Notif[] | null>(null);
    const [unread, setUnread] = useState(0);

    const refresh = useCallback(async () => {
        try {
            const list = await api<Notif[]>("/notifications?limit=40");
            setItems(list);
            setUnread(list.filter((n) => !n.read).length);
        } catch {
            /* not signed in / offline — keep prior */
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refresh();
        const t = setInterval(refresh, pollMs);
        return () => clearInterval(t);
    }, [refresh, pollMs]);

    // Realtime: a new notification arrives instantly (prepend + bump unread).
    useRealtime<Notif>("notification:new", (n) => {
        setItems((p) => (p ? [n, ...p.filter((x) => x.id !== n.id)].slice(0, 40) : [n]));
        setUnread((u) => u + 1);
    });
    // Server pushes the authoritative unread count after any change.
    useRealtime<{ count: number }>("notification:count", ({ count }) => setUnread(count));

    const markRead = useCallback(async (id: string) => {
        setItems((p) => p?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? p);
        setUnread((u) => Math.max(0, u - 1));
        try {
            await api(`/notifications/${id}/read`, { method: "POST" });
        } catch {
            /* best-effort */
        }
    }, []);

    const markAll = useCallback(async () => {
        setItems((p) => p?.map((n) => ({ ...n, read: true })) ?? p);
        setUnread(0);
        try {
            await api("/notifications/read-all", { method: "POST" });
        } catch {
            /* best-effort */
        }
    }, []);

    return { items, unread, refresh, markRead, markAll };
}
