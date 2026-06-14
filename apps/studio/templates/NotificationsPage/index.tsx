"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useScrollResetOnChange } from "@/lib/useScroll";
import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Select from "@/components/ui/Select";
import { api } from "@/lib/api";
import { metaFor, relTime, useNotifications, type Notif } from "@/lib/useNotifications";
import { cn } from "@/lib/cn";

type DigestFreq = "off" | "daily" | "weekly";

/** Email-digest preference + send-test, persisted per user. */
const DigestControl = () => {
    const [freq, setFreq] = useState<DigestFreq>("off");
    const [testing, setTesting] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<{ digestFrequency: DigestFreq }>("/notifications/preferences").then((p) => setFreq(p.digestFrequency)).catch(() => {});
    }, []);

    const change = async (f: DigestFreq) => {
        setFreq(f);
        setMsg(null);
        try {
            await api("/notifications/preferences", { method: "PATCH", body: JSON.stringify({ digestFrequency: f }) });
        } catch {
            /* ignore */
        }
    };

    const test = async () => {
        setTesting(true);
        setMsg(null);
        try {
            const r = await api<{ sent: boolean; count: number; reason?: string }>("/notifications/digest/test", { method: "POST" });
            setMsg(r.sent ? `Sent · ${r.count} item${r.count === 1 ? "" : "s"}` : r.reason === "no-email" ? "No email on file" : "Connect SMTP to send");
        } catch {
            setMsg("Send failed");
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption-2 text-grey">Email digest</span>
            <Select
                variant="field"
                className="!w-auto"
                ariaLabel="Email digest frequency"
                value={freq}
                onChange={(v) => change(v as DigestFreq)}
                options={[
                    { value: "off", label: "Off" },
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                ]}
            />
            {freq !== "off" && (
                <button type="button" onClick={test} disabled={testing} className="btn-secondary h-11 px-3.5 text-caption-1 disabled:opacity-60">
                    {testing ? "Sending…" : "Send test"}
                </button>
            )}
            {msg && <span className="text-caption-2 text-grey">{msg}</span>}
        </div>
    );
};

type Tab = "all" | "unread";
const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread" },
];

const DAY_ORDER = ["Today", "Yesterday", "Earlier"] as const;
const dayBucket = (iso: string): (typeof DAY_ORDER)[number] => {
    const d = new Date(iso);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((+today - +day) / 86_400_000);
    if (diff <= 0) return "Today";
    if (diff === 1) return "Yesterday";
    return "Earlier";
};

/**
 * Notifications page — live from /notifications (polled). Filter by all/unread,
 * grouped by day. Clicking a row marks it read and follows its link.
 */
const NotificationsPage = () => {
    const { items, unread, markRead, markAll } = useNotifications(20000);
    const [tab, setTab] = useState<Tab>("all");
    const topRef = useRef<HTMLDivElement>(null);
    useScrollResetOnChange(topRef, tab);

    const list: Notif[] = items ?? [];
    const filtered = useMemo(() => (tab === "unread" ? list.filter((n) => !n.read) : list), [tab, list]);
    const groups = DAY_ORDER.map((day) => ({ day, items: filtered.filter((n) => dayBucket(n.createdAt) === day) })).filter((g) => g.items.length > 0);

    return (
        <>
            <PageHeader
                title="Notifications"
                intro="Everything happening across your workspace."
                actions={
                    <div className="flex flex-wrap items-center gap-3">
                        <DigestControl />
                        <button type="button" onClick={() => void markAll()} disabled={unread === 0} className="btn-secondary h-11 disabled:opacity-60">
                            Mark all as read
                        </button>
                    </div>
                }
            />

            <div ref={topRef} className="scroll-mt-6" />
            <div className="mb-6 flex gap-2">
                {TABS.map((t) => {
                    const active = t.id === tab;
                    const count = t.id === "unread" ? unread : null;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-md text-menu transition-colors",
                                active ? "bg-primary text-white" : "text-grey hover:text-primary hover:bg-lavender-mist dark:hover:bg-dark-1",
                            )}
                        >
                            {t.label}
                            {count ? (
                                <span className={cn("inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-pill text-[0.6875rem] font-bold", active ? "bg-white/25 text-white" : "bg-primary text-white")}>{count}</span>
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <Card>
                {groups.length === 0 ? (
                    <div className="py-16 text-center text-body text-grey">
                        {items === null ? "Loading…" : "Nothing here. You're all caught up."}
                    </div>
                ) : (
                    <div className="flex flex-col gap-7">
                        {groups.map((g) => (
                            <div key={g.day}>
                                <div className="mb-2 text-caption-2 font-semibold uppercase tracking-wide text-grey">{g.day}</div>
                                <div className="flex flex-col">
                                    {g.items.map((n) => {
                                        const m = metaFor(n.type);
                                        return (
                                            <Link
                                                key={n.id}
                                                href={n.href || "/notifications"}
                                                onClick={() => !n.read && void markRead(n.id)}
                                                className={cn(
                                                    "group flex items-center gap-4 px-3 py-3.5 -mx-3 rounded-2xl text-left transition-colors hover:bg-lavender-mist/70 dark:hover:bg-dark-3/60",
                                                    !n.read && "bg-lavender-mist/50 dark:bg-dark-3/40",
                                                )}
                                            >
                                                <span className="flex items-center justify-center w-11 h-11 rounded-full shrink-0" style={{ backgroundColor: `${m.color}22` }}>
                                                    <Icon className="w-5 h-5" name={m.icon} fill={m.color} />
                                                </span>
                                                <div className="grow min-w-0">
                                                    <div className="text-title text-black dark:text-white">{n.title}</div>
                                                    {n.body && <div className="mt-0.5 whitespace-pre-line text-caption-2 text-grey">{n.body}</div>}
                                                </div>
                                                <div className="flex shrink-0 items-center gap-3">
                                                    <span className="text-caption-2 text-grey">{relTime(n.createdAt)}</span>
                                                    {!n.read && <span className="w-2 h-2 rounded-full bg-primary" />}
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </>
    );
};

export default NotificationsPage;
