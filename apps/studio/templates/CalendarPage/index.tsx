"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import StatusPill from "@/components/ui/StatusPill";
import { typeColor, type CalEvent } from "@/mocks/calendar";
import type { ContentType } from "@/mocks/content";
import type { PillStatus } from "@/components/ui/StatusPill";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TYPES: ContentType[] = ["Blog", "Page", "Landing", "Case Study"];

/** A calendar event carrying its full year/month so the grid can span months. */
type Ev = Omit<CalEvent, "author"> & { author: { name: string }; year: number; month: number };

type Entry = { id: string; title: string; status: string; scheduledAt: string | null; publishedAt: string | null; author: { name: string } | null; contentType: { name: string } };

const mapType = (name: string): ContentType => {
    const n = name.toLowerCase();
    if (n.includes("blog") || n.includes("article") || n.includes("post")) return "Blog";
    if (n.includes("case") || n.includes("study")) return "Case Study";
    if (n.includes("land")) return "Landing";
    if (n.includes("page")) return "Page";
    return "Page";
};
const mapStatus = (s: string): Exclude<PillStatus, "approved"> => {
    if (s === "PUBLISHED") return "live";
    if (s === "SCHEDULED" || s === "APPROVED") return "scheduled";
    if (s === "IN_REVIEW") return "review";
    return "draft";
};
const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * Content calendar — a navigable month grid with type-colored event chips plus a
 * "Coming up" rail. Live from /entries (scheduled + published placed on real
 * dates), Month / List views. Empty months show an empty state, never sample
 * rows. Animated, reduced-motion safe.
 */
const CalendarPage = () => {
    const reduce = useReducedMotion();
    const [events, setEvents] = useState<Ev[]>([]);
    const [loaded, setLoaded] = useState(false);
    const now = useMemo(() => new Date(), []);
    const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
    const [view, setView] = useState<"month" | "list">("month");

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<Entry[]>("/entries")
            .then((rows) => {
                const evs: Ev[] = rows
                    .map((e) => {
                        const iso = e.scheduledAt ?? e.publishedAt;
                        if (!iso) return null;
                        const d = new Date(iso);
                        return {
                            id: e.id,
                            title: e.title,
                            type: mapType(e.contentType?.name ?? ""),
                            day: d.getDate(),
                            time: fmtTime(d),
                            status: mapStatus(e.status),
                            author: { name: e.author?.name ?? "—" },
                            year: d.getFullYear(),
                            month: d.getMonth(),
                        } as Ev;
                    })
                    .filter((e): e is Ev => e !== null);
                setEvents(evs);
            })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    const todayDay = now.getDate();
    const todayInView = cursor.year === now.getFullYear() && cursor.month === now.getMonth();

    const monthEvents = useMemo(() => events.filter((e) => e.year === cursor.year && e.month === cursor.month), [events, cursor]);

    const eventsByDay = useMemo(() => {
        const map = new Map<number, Ev[]>();
        for (const e of monthEvents) {
            const list = map.get(e.day) ?? [];
            list.push(e);
            map.set(e.day, list);
        }
        return map;
    }, [monthEvents]);

    const grid = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor]);
    const go = (delta: number) =>
        setCursor((c) => {
            const m = c.month + delta;
            if (m < 0) return { year: c.year - 1, month: 11 };
            if (m > 11) return { year: c.year + 1, month: 0 };
            return { year: c.year, month: m };
        });

    // Upcoming: next scheduled posts across all months, soonest first.
    const comingUp = useMemo(() => {
        const ref = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return events
            .filter((e) => e.status === "scheduled")
            .filter((e) => new Date(e.year, e.month, e.day) >= ref)
            .sort((a, b) => +new Date(a.year, a.month, a.day) - +new Date(b.year, b.month, b.day))
            .slice(0, 8);
    }, [events, now]);

    const listDays = useMemo(() => {
        const days = [...new Set(monthEvents.map((e) => e.day))].sort((a, b) => a - b);
        return days.map((d) => ({ day: d, items: monthEvents.filter((e) => e.day === d) }));
    }, [monthEvents]);

    return (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_20rem]">
            <Card flush className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-grey-light dark:border-grey-light/10">
                    <div className="flex items-center gap-3">
                        <h2 className="text-h5 text-black dark:text-white">{MONTHS[cursor.month]} {cursor.year}</h2>
                        <div className="flex items-center gap-1">
                            <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="btn-circle w-9 h-9 dark:bg-dark-3">
                                <Icon className="w-4 h-4 fill-black dark:fill-white" name="arrow-left" />
                            </button>
                            <button type="button" aria-label="Next month" onClick={() => go(1)} className="btn-circle w-9 h-9 dark:bg-dark-3">
                                <Icon className="w-4 h-4 fill-black dark:fill-white" name="arrow-right" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 p-1 rounded-2xl bg-lavender-mist dark:bg-dark-3">
                            {(["month", "list"] as const).map((v) => (
                                <button key={v} type="button" onClick={() => setView(v)} className={cn("px-3 h-8 rounded-xl text-caption-1 font-semibold capitalize transition-colors", view === v ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey hover:text-primary")}>{v}</button>
                            ))}
                        </div>
                        <Link href="/content/editor" className="btn-primary h-10 px-4 gap-2">
                            <Icon className="w-5 h-5 fill-white" name="plus" />
                            <span className="hidden sm:inline">Schedule</span>
                        </Link>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5 border-b border-grey-light dark:border-grey-light/10">
                    {TYPES.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1.5 text-caption-2 text-grey">
                            <span className="w-2.5 h-2.5 rounded-[0.25rem]" style={{ backgroundColor: typeColor[t] }} />
                            {t}
                        </span>
                    ))}
                </div>

                {loaded && monthEvents.length === 0 ? (
                    <EmptyState
                        variant="bare"
                        className="px-6 py-16"
                        icon="calendar"
                        title="Nothing scheduled"
                        description="Scheduled and published content will appear here."
                        action={{ label: "Create content", href: "/content" }}
                    />
                ) : (
                <AnimatePresence mode="wait">
                    {view === "month" ? (
                        <motion.div key="month" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.2 }}>
                            <div className="grid grid-cols-7 border-b border-grey-light dark:border-grey-light/10">
                                {WEEKDAYS.map((w) => (
                                    <div key={w} className="px-3 py-2.5 text-caption-2 text-grey">{w}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7">
                                {grid.map((cell, i) => {
                                    const dayEvents = cell ? eventsByDay.get(cell) ?? [] : [];
                                    const today = !!cell && todayInView && cell === todayDay;
                                    return (
                                        <div key={cell ? `d${cell}` : `e${i}`} className={cn("min-h-[7.5rem] p-2 border-b border-r border-grey-light dark:border-grey-light/10", i % 7 === 6 && "border-r-0", !cell && "bg-grey-light/20 dark:bg-grey-light/5", today && "bg-primary/[0.04]")}>
                                            {cell && (
                                                <>
                                                    <div className="mb-1.5 flex items-center">
                                                        <span className={cn("inline-flex items-center justify-center w-6 h-6 rounded-md text-caption-1", today ? "bg-orange text-white font-bold" : "text-black dark:text-white")}>{cell}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        {dayEvents.slice(0, 2).map((e, j) => (
                                                            <EventChip key={e.id} event={e} delay={reduce ? 0 : j * 0.04} />
                                                        ))}
                                                        {dayEvents.length > 2 && <span className="px-1 text-[0.6875rem] font-medium text-grey">+{dayEvents.length - 2} more</span>}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div key="list" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.2 }} className="p-5 flex flex-col gap-6">
                            {listDays.length === 0 ? (
                                <div className="py-12 text-center text-body text-grey">Nothing scheduled this month.</div>
                            ) : (
                                listDays.map((group) => (
                                    <div key={group.day}>
                                        <div className="mb-2 text-caption-1 text-grey">{MONTHS[cursor.month].slice(0, 3)} {group.day}</div>
                                        <div className="flex flex-col gap-2">
                                            {group.items.map((e) => (
                                                <ListRow key={e.id} event={e} />
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
                )}
            </Card>

            <Card className="flex flex-col h-full !p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Icon className="w-5 h-5 fill-primary" name="calendar" />
                    <h2 className="text-h5 text-black dark:text-white">Coming up</h2>
                </div>
                <div className="flex flex-col gap-3">
                    {comingUp.map((e, i) => (
                        <motion.div key={e.id} initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.06 }}>
                            <UpcomingCard event={e} />
                        </motion.div>
                    ))}
                    {comingUp.length === 0 && <p className="text-body-sm text-grey">No scheduled posts.</p>}
                </div>
            </Card>
        </div>
    );
};

const EventChip = ({ event, delay }: { event: Ev; delay: number }) => {
    const color = typeColor[event.type];
    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay }}>
            <Link href="/content/editor" className="block rounded-lg border-l-2 py-1 pl-2 pr-1.5 transition-transform hover:translate-x-0.5" style={{ borderColor: color, backgroundColor: `${color}12` }} title={event.title}>
                {event.time && <span className="block text-[0.625rem] font-bold leading-none" style={{ color }}>{event.time}</span>}
                <span className="block truncate text-[0.6875rem] font-medium leading-tight text-black dark:text-white">{event.title}</span>
            </Link>
        </motion.div>
    );
};

const ListRow = ({ event }: { event: Ev }) => {
    const color = typeColor[event.type];
    return (
        <Link href="/content/editor" className="group flex items-center gap-3 rounded-2xl border border-grey-light p-3 transition-shadow hover:shadow-[0_0.5rem_1.5rem_rgba(227,230,236,0.6)] dark:border-grey-light/10">
            <span className="flex w-16 shrink-0 flex-col items-center justify-center rounded-md py-1.5" style={{ backgroundColor: `${color}14` }}>
                <span className="text-caption-1 font-bold leading-tight" style={{ color }}>{event.time ?? "TBD"}</span>
            </span>
            <div className="min-w-0 grow">
                <div className="truncate text-title text-black transition-colors group-hover:text-primary dark:text-white">{event.title}</div>
                <div className="mt-0.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-caption-2 font-semibold" style={{ color }}>
                        <span className="w-2 h-2 rounded-[0.2rem]" style={{ backgroundColor: color }} />
                        {event.type}
                    </span>
                    <span className="text-caption-2 text-grey">· {event.author.name}</span>
                </div>
            </div>
            <StatusPill status={event.status} className="shrink-0" />
        </Link>
    );
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const UpcomingCard = ({ event }: { event: Ev }) => {
    const color = typeColor[event.type];
    return (
        <Link href="/content/editor" className="group flex gap-3 rounded-2xl border border-grey-light p-3 transition-shadow hover:shadow-[0_0.5rem_1.5rem_rgba(227,230,236,0.6)] dark:border-grey-light/10">
            <span className="flex w-12 shrink-0 flex-col items-center justify-center rounded-md py-1.5" style={{ backgroundColor: `${color}14` }}>
                <span className="font-poppins text-[1.25rem] font-extrabold leading-none" style={{ color }}>{event.day}</span>
                <span className="text-[0.625rem] text-grey">{MONTHS_SHORT[event.month]}</span>
            </span>
            <div className="min-w-0 grow">
                <div className="truncate text-body-sm font-semibold text-black transition-colors group-hover:text-primary dark:text-white">{event.title}</div>
                <div className="mt-1 flex items-center gap-1.5">
                    <Avatar name={event.author.name} size={18} />
                    <span className="text-caption-2 text-grey">{event.time ?? "TBD"} · {event.type}</span>
                </div>
            </div>
        </Link>
    );
};

/** Build a 6×7 grid (Mon-first) of day numbers, null for padding cells. */
function buildGrid(year: number, month: number): (number | null)[] {
    const first = new Date(year, month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

export default CalendarPage;
