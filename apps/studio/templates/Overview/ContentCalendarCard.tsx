"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/ui/EmptyState";
import LiveBadge from "../seo/LiveBadge";
import {
    type CalendarCategory,
    type TimelineEvent,
    type WeekDay,
} from "@/mocks/dashboard";
import { zonedClock, zonedDayStart, zonedWeekday } from "@flowcms/shared/time";
import { useDashboard } from "@/lib/useDashboard";
import { cn } from "@/lib/cn";

const dotColor: Record<string, string> = { done: "bg-success", active: "bg-primary", muted: "bg-grey-light" };
const COLS = 7; // Mon–Sun

// Status → bar color + which header dot to show.
const STATUS_COLOR: Record<string, string> = { SCHEDULED: "#3B82F6", APPROVED: "#00B894", PUBLISHED: "#6C5CE7", IN_REVIEW: "#F5A623", DRAFT: "#9999B0" };
const DAY_LETTERS = ["M", "T", "W", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TYPE_COLOR = ["#E91E63", "#6C5CE7", "#FF9800", "#4CAF50", "#00B894"];

/** A timeline event that may carry the entry id (live data) so the chip can deep-link. */
type CalEvent = TimelineEvent & { id?: string };

/**
 * Content Calendar (overview): week timeline of what is scheduled and what went
 * live. The server sends this week's items only (in the workspace's time zone);
 * they are placed by day + hour in that same zone, with a left category filter
 * built from the content types present.
 */
const ContentCalendarCard = () => {
    const [category, setCategory] = useState("all");
    const reduce = useReducedMotion();
    const { data: summary, loading, error } = useDashboard();

    const built = useMemo(() => (summary?.calendar ? buildLive(summary.calendar, summary.weekStart, summary.timezone) : null), [summary]);
    const live = built !== null;
    // Why there is no timeline: still loading, the fetch failed, or this role
    // doesn't get the workspace calendar.
    const reason = loading ? "Loading" : !summary ? (error ? "Couldn’t load" : "Unavailable") : "No access";

    // This week's date numbers (Mon..Sun) under each day letter, in the workspace's
    // zone once known. (Dashboard cards render client-side behind the auth gate, so
    // a date computed here is hydration-safe.)
    const weekDates = useMemo(() => {
        const tz = summary?.timezone ?? "UTC";
        const start = summary ? new Date(summary.weekStart) : zonedDayStart(new Date(), tz, -zonedWeekday(new Date(), tz));
        return Array.from({ length: 7 }, (_, i) => zonedClock(zonedDayStart(start, tz, i), tz).day);
    }, [summary]);

    // Layout scaffolding (day-letter header, "All content" filter, month label)
    // is built from real data once loaded, or a neutral empty week while loading.
    const monthLabel = built?.monthLabel ?? MONTHS[new Date().getMonth()];
    const weekHeader: WeekDay[] = built?.week ?? Array.from({ length: 7 }, (_, i) => ({ key: `d${i}`, label: DAY_LETTERS[i], dot: undefined, today: false }));
    const categories: CalendarCategory[] = built?.categories ?? [{ id: "all", label: "All content", icon: "grid", iconBg: "#EDE9FB", iconColor: "#6C5CE7" }];
    const hours: string[] = built?.hours ?? [];
    const allEvents: CalEvent[] = built?.events ?? [];

    // Loaded (built present) but no scheduled/published items this week.
    const isEmpty = live && hours.length === 0;

    const visible = allEvents.filter((e) => category === "all" || e.category === category);

    return (
        <Card className="flex flex-col h-full xl:min-h-[28.5rem]">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <h2 className="text-h5 text-black dark:text-white">Content calendar</h2>
                    <LiveBadge live={live} source="Content" reason={reason} />
                </div>
                <Link href="/content/calendar" className="text-caption-1 text-primary transition-opacity hover:opacity-70">Open calendar</Link>
            </div>

            <div className="grid grid-cols-1 gap-5 grow lg:grid-cols-[10.5rem_1fr]">
                {/* Left: week label + category filters */}
                <div className="flex flex-col">
                    <span className="mb-4 font-poppins text-[1.25rem] font-semibold text-black dark:text-white">This week</span>
                    <div className="flex flex-col gap-1">
                        {categories.map((c) => {
                            const active = c.id === category;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setCategory(c.id)}
                                    className={cn(
                                        "group flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left transition-all",
                                        active ? "bg-primary font-bold text-white shadow-glow" : "hover:bg-lavender-mist dark:hover:bg-dark-3",
                                    )}
                                >
                                    <span className="flex items-center justify-center w-6 h-6 rounded-md shrink-0" style={{ backgroundColor: active ? "rgba(255,255,255,0.18)" : `${c.iconColor}22` }}>
                                        <Icon className="w-3.5 h-3.5" name={c.icon} fill={active ? "#fff" : c.iconColor} />
                                    </span>
                                    <span className={cn("text-caption-1", active ? "text-white" : "text-black dark:text-white")}>{c.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right: full-week timeline */}
                <div className="rounded-2xl border border-grey-light dark:border-grey-light/10">
                    <div className="flex items-center h-[4.5rem] px-4 border-b border-grey-light dark:border-grey-light/10">
                        <span className="shrink-0 w-11 text-caption-1 text-grey">{monthLabel}</span>
                        <div className="flex grow justify-around">
                            {weekHeader.map((d, i) => (
                                <span key={d.key} className="inline-flex flex-col items-center gap-1">
                                    <span className="text-caption-2 font-medium text-grey">{d.label}</span>
                                    <span className="relative">
                                        <span className={cn("inline-flex items-center justify-center w-8 h-8 rounded-md text-menu font-medium", d.today ? "bg-orange text-white" : "text-black dark:text-white")}>{weekDates[i]}</span>
                                        {d.dot && !d.today && <span className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-dark-1", dotColor[d.dot])} />}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="relative px-4 py-5">
                        <div className="absolute top-5 bottom-5 left-[3.75rem] right-4 pointer-events-none">
                            {Array.from({ length: COLS - 1 }, (_, k) => k + 1).map((i) => (
                                <span key={i} className="absolute top-0 bottom-0 w-px bg-grey-light dark:bg-grey-light/10" style={{ left: `${(i / COLS) * 100}%` }} />
                            ))}
                        </div>

                        {hours.length === 0 ? (
                            isEmpty ? (
                                <EmptyState
                                    variant="bare"
                                    icon="calendar"
                                    title="Nothing this week"
                                    description="Content scheduled or published this week appears on this timeline."
                                    className="py-10"
                                />
                            ) : loading ? (
                                <div className="py-10" aria-hidden />
                            ) : (
                                <p className="py-10 text-center text-body-sm text-grey" role={summary ? undefined : "alert"}>
                                    {summary ? "Your role doesn’t include the workspace calendar." : "Couldn’t load the calendar. Reload to try again."}
                                </p>
                            )
                        ) : (
                            <div className="relative flex flex-col gap-5">
                                {hours.map((h) => {
                                    const evs = visible.filter((e) => e.hour === h).sort((a, b) => a.startCol - b.startCol);
                                    return (
                                        <div key={h} className="flex items-center">
                                            <span className="shrink-0 w-11 text-caption-2 text-grey">{h}</span>
                                            <div className="relative grow h-7 overflow-hidden">
                                                {evs.map((ev, idx) => {
                                                    // Cap each chip at the gap to the next event (or the track
                                                    // edge) so long titles truncate instead of spilling out.
                                                    const rightCol = evs[idx + 1]?.startCol ?? COLS;
                                                    const maxW = ((rightCol - ev.startCol) / COLS) * 100;
                                                    return (
                                                        <motion.div
                                                            key={category + h + idx}
                                                            className="absolute top-0 flex items-center h-7 px-1 rounded-[0.5rem] overflow-hidden"
                                                            style={{ left: `${(ev.startCol / COLS) * 100}%`, maxWidth: `${maxW}%`, backgroundColor: ev.color, transformOrigin: "left center" }}
                                                            initial={reduce ? false : { opacity: 0, scaleX: 0.6 }}
                                                            animate={{ opacity: 1, scaleX: 1 }}
                                                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                                                            title={ev.title}
                                                        >
                                                            {ev.id ? (
                                                                <Link href={`/content/editor?id=${ev.id}`} className="block min-w-0 truncate rounded-[0.375rem] bg-white/85 px-2.5 py-0.5 text-[0.6875rem] font-medium leading-tight text-black transition-transform hover:scale-[1.03] dark:bg-dark-1/85 dark:text-white">{ev.title}</Link>
                                                            ) : (
                                                                <span className="block min-w-0 truncate rounded-[0.375rem] bg-white/85 px-2.5 py-0.5 text-[0.6875rem] font-medium leading-tight text-black dark:bg-dark-1/85 dark:text-white">{ev.title}</span>
                                                            )}
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
};

type CalItem = { id: string; title: string; type: string; date: string | null; status: string };

/** Build week header, categories, hour rows and bars from this week's items. Days
 *  and hours are read in the workspace's time zone, the same one the server used
 *  to pick the week, so an item never lands on a different day than it was sent for. */
export function buildLive(calendar: CalItem[], weekStartIso: string, tz: string, now = new Date()): { week: WeekDay[]; categories: CalendarCategory[]; hours: string[]; events: CalEvent[]; monthLabel: string } {
    const weekStart = new Date(weekStartIso);
    const weekEnd = zonedDayStart(weekStart, tz, 7);

    const inWeek = calendar
        .map((e) => ({ ...e, d: e.date ? new Date(e.date) : null }))
        .filter((e): e is CalItem & { d: Date } => !!e.d && e.d >= weekStart && e.d < weekEnd);

    // Distinct content types → stable category list + color map.
    const typeNames = [...new Set(calendar.map((e) => e.type))];
    const typeColor = new Map(typeNames.map((t, i) => [t, TYPE_COLOR[i % TYPE_COLOR.length]]));
    const categories: CalendarCategory[] = [
        { id: "all", label: "All content", icon: "grid", iconBg: "#EDE9FB", iconColor: "#6C5CE7" },
        ...typeNames.map((t) => ({ id: t, label: t, icon: "document", iconBg: "#EDE9FB", iconColor: typeColor.get(t)! })),
    ];

    // Per-day dots from highest-priority status that day.
    const byDay = new Map<number, string[]>();
    for (const e of inWeek) {
        const col = zonedWeekday(e.d, tz);
        const list = byDay.get(col) ?? [];
        list.push(e.status);
        byDay.set(col, list);
    }
    const todayCol = now >= weekStart && now < weekEnd ? zonedWeekday(now, tz) : -1;
    const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
        const statuses = byDay.get(i) ?? [];
        const dot = statuses.includes("PUBLISHED") ? "done" : statuses.includes("SCHEDULED") || statuses.includes("APPROVED") ? "active" : statuses.length ? "muted" : undefined;
        return { key: `d${i}`, label: DAY_LETTERS[i], dot: dot as WeekDay["dot"], today: i === todayCol };
    });

    const events: CalEvent[] = inWeek.map((e) => {
        const hh = String(zonedClock(e.d, tz).hour).padStart(2, "0");
        return { id: e.id, hour: `${hh}:00`, title: e.title, startCol: zonedWeekday(e.d, tz), span: 1, color: STATUS_COLOR[e.status] ?? "#6C5CE7", category: e.type };
    });
    const hours = [...new Set(events.map((e) => e.hour))].sort();

    return { week, categories, hours, events, monthLabel: MONTHS[zonedClock(now, tz).month - 1] };
}

export default ContentCalendarCard;
