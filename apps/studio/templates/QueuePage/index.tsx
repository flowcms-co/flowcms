"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Menu, Transition } from "@headlessui/react";
import Card from "@/components/ui/Card";
import Avatar from "@/components/ui/Avatar";
import Select from "@/components/ui/Select";
import CountUp from "@/components/motion/CountUp";
import ScheduleModal from "@/components/editor/ScheduleModal";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/* ---------------- types + data mapping ---------------- */

type ApiEntry = {
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
    updatedAt: string;
    author: { id?: string | null; name: string; title?: string | null; avatarUrl?: string | null; avatarStyle?: string | null } | null;
    contentType: { name: string } | null;
};

type StatusKey = "draft" | "review" | "approved" | "scheduled";
type GroupKey = "attention" | "ready" | "scheduled";

type Row = {
    id: string;
    title: string;
    status: StatusKey;
    type: string;
    author: { id?: string | null; name: string; title?: string | null; avatarUrl?: string | null; avatarStyle?: string | null };
    dateObj: Date | null;
    time?: string;
    date?: string;
    group: GroupKey;
};

const STATUS_MAP: Record<string, StatusKey> = { DRAFT: "draft", SCHEDULED: "scheduled", APPROVED: "approved", IN_REVIEW: "review" };
const STATUS_INDEX: Record<StatusKey, number> = { draft: 0, review: 1, approved: 2, scheduled: 3 };
const STEPS = ["Draft", "Review", "Approved", "Scheduled", "Published"];

/* Inline icons (lucide-style) for precise sizing + brand colour. */
const PATHS = {
    queue: "M3 6h18M3 12h18M3 18h12",
    publishWeek: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    rocket: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    send: "M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    check: "M20 6 9 17l-5-5",
    arrowRight: "M5 12h14M13 6l6 6-6 6",
    dots: "M12 5h.01M12 12h.01M12 19h.01",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    rows: "M3 5h18v6H3zM3 13h18v6H3z",
};

const Stroke = ({ d, color, className }: { d: string; color?: string; className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);

/* Content-type accent (kept within the brand palette). */
const typeColor = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes("blog")) return "#6C5CE7";
    if (n.includes("landing")) return "#3B82F6";
    if (n.includes("case")) return "#F5A623";
    if (n.includes("guide")) return "#00B894";
    if (n.includes("page")) return "#E0529C";
    return "#6C5CE7";
};
const STATUS_COLOR: Record<StatusKey, string> = { draft: "#94A3B8", review: "#6C5CE7", approved: "#00B894", scheduled: "#3B82F6" };
const STATUS_LABEL: Record<StatusKey, string> = { draft: "Draft", review: "In review", approved: "Approved", scheduled: "Scheduled" };

const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};
const daysFromToday = (d: Date) => Math.round((+startOfDay(d) - +startOfDay(new Date())) / 86_400_000);
const fmtTime = (d: Date | null) => (d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : undefined);
const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
const fmtWhen = (d: Date) => {
    const diff = daysFromToday(d);
    const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (diff === 0) return `Today at ${t}`;
    if (diff === 1) return `Tomorrow at ${t}`;
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${t}`;
};

const groupOf = (status: StatusKey, d: Date | null): GroupKey => {
    if (status === "review" || status === "approved") return "attention";
    if (status === "draft") return "attention";
    return d && daysFromToday(d) <= 0 ? "ready" : "scheduled"; // scheduled & due → ready
};
const GROUPS: { key: GroupKey; label: string }[] = [
    { key: "attention", label: "Needs attention" },
    { key: "ready", label: "Ready to publish" },
    { key: "scheduled", label: "Scheduled" },
];

/* ---------------- page ---------------- */

const QueuePage = () => {
    const reduce = useReducedMotion();
    const [rows, setRows] = useState<Row[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [scheduleFor, setScheduleFor] = useState<string | null>(null);

    const [q, setQ] = useState("");
    const [type, setType] = useState("all");
    const [author, setAuthor] = useState("all");
    const [status, setStatus] = useState("all");
    const [dense, setDense] = useState(false);

    const load = useCallback(async () => {
        try {
            const entries = await api<ApiEntry[]>("/entries");
            const mapped: Row[] = entries
                .filter((e) => STATUS_MAP[e.status])
                .map((e) => {
                    const st = STATUS_MAP[e.status];
                    const dateObj = e.scheduledAt ? new Date(e.scheduledAt) : null;
                    return {
                        id: e.id,
                        title: e.title,
                        status: st,
                        type: e.contentType?.name ?? "Content",
                        author: e.author ?? { name: "Unassigned" },
                        dateObj,
                        time: fmtTime(dateObj),
                        date: fmtDate(dateObj),
                        group: groupOf(st, dateObj),
                    };
                });
            setRows(mapped);
        } catch {
            setRows([]);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const publishNow = async (id: string) => {
        setBusyId(id);
        try {
            await api(`/entries/${id}/publish`, { method: "POST" });
            await load();
        } catch {
            /* status reloads */
        } finally {
            setBusyId(null);
        }
    };
    const doSchedule = async (iso: string) => {
        const id = scheduleFor;
        if (!id) return;
        setBusyId(id);
        setScheduleFor(null);
        try {
            await api(`/entries/${id}`, { method: "PATCH", body: JSON.stringify({ status: "SCHEDULED", scheduledAt: iso }) });
            await load();
        } catch {
            /* status reloads */
        } finally {
            setBusyId(null);
        }
    };

    const all = useMemo(() => rows ?? [], [rows]);
    const types = useMemo(() => [...new Set(all.map((r) => r.type))].sort(), [all]);
    const authors = useMemo(() => [...new Set(all.map((r) => r.author.name))].sort(), [all]);

    const filtered = all.filter((r) => {
        if (r.status === "draft") return false; // drafts shown only in stat count
        if (q && !r.title.toLowerCase().includes(q.toLowerCase())) return false;
        if (type !== "all" && r.type !== type) return false;
        if (author !== "all" && r.author.name !== author) return false;
        if (status !== "all" && r.status !== status) return false;
        return true;
    });

    // Glance stats (over the unfiltered queue).
    const inDraft = all.filter((r) => r.status === "draft").length;
    const thisWeek = all.filter((r) => r.status === "scheduled" && r.dateObj && daysFromToday(r.dateObj) >= 0 && daysFromToday(r.dateObj) < 7).length;
    const approvedReady = all.filter((r) => r.status === "approved").length;
    const inReview = all.filter((r) => r.status === "review").length;
    const next = all
        .filter((r) => r.status === "scheduled" && r.dateObj)
        .sort((a, b) => +a.dateObj! - +b.dateObj!)[0];

    const groups = GROUPS.map((g) => ({
        ...g,
        items: filtered
            .filter((r) => r.group === g.key)
            .sort((a, b) => (a.dateObj && b.dateObj ? +a.dateObj - +b.dateObj : a.dateObj ? -1 : b.dateObj ? 1 : 0)),
    })).filter((g) => g.items.length > 0);

    return (
        <div className="flex flex-col gap-6">
            {/* Content at a glance */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_22rem]">
                <Card className="!p-5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                        <Stat icon={PATHS.queue} color="#6C5CE7" value={inDraft} label="In draft" />
                        <Stat icon={PATHS.publishWeek} color="#3B82F6" value={thisWeek} label="Publishing this week" />
                        <Stat icon={PATHS.rocket} color="#00B894" value={approvedReady} label="Ready to go live" />
                        <Stat icon={PATHS.clock} color="#F5A623" value={inReview} label="In review" />
                    </div>
                </Card>

                {next ? (
                    <Link
                        href={`/content/editor?id=${next.id}`}
                        className="group relative flex items-center gap-3.5 overflow-hidden rounded-3xl p-5 text-white shadow-[0_0.75rem_2rem_rgba(108,92,231,0.35)] bg-[linear-gradient(135deg,#6C5CE7_0%,#8674F0_55%,#A29BFE_100%)]"
                    >
                        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                            <Stroke d={PATHS.calendar} className="h-5 w-5 text-white" />
                        </span>
                        <div className="relative min-w-0 grow">
                            <div className="text-caption-2 font-medium text-white/80">Next publish</div>
                            <div className="truncate text-caption-1 font-semibold text-white">{next.title}</div>
                            <div className="truncate text-caption-2 text-white/80">{fmtWhen(next.dateObj!)} · {next.author.name}</div>
                        </div>
                        <Stroke d={PATHS.arrowRight} className="relative h-5 w-5 shrink-0 text-white transition-transform group-hover:translate-x-0.5" />
                    </Link>
                ) : (
                    <div className="flex items-center gap-3.5 rounded-3xl border border-dashed border-grey-light p-5 dark:border-grey-light/20">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lavender-mist text-grey dark:bg-dark-3">
                            <Stroke d={PATHS.calendar} className="h-5 w-5" />
                        </span>
                        <div>
                            <div className="text-caption-1 font-semibold text-black dark:text-white">Nothing scheduled</div>
                            <div className="text-caption-2 text-grey">Your next publish will show up here.</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3">
                <label className="relative grow sm:max-w-xs">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-grey">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                    </span>
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search content..."
                        className="h-9 w-full rounded-[0.4rem] border border-grey-light bg-white pl-10 pr-3 text-body-sm text-black outline-none transition-colors placeholder:text-grey focus:border-primary dark:border-grey-light/15 dark:bg-dark-1 dark:text-white"
                    />
                </label>
                <Select variant="filter" value={type} onChange={setType} ariaLabel="Filter by type" active={type !== "all"} options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: t }))]} />
                <Select variant="filter" value={author} onChange={setAuthor} ariaLabel="Filter by author" active={author !== "all"} options={[{ value: "all", label: "All authors" }, ...authors.map((a) => ({ value: a, label: a }))]} />
                <Select variant="filter" value={status} onChange={setStatus} ariaLabel="Filter by status" active={status !== "all"} options={[{ value: "all", label: "All statuses" }, { value: "review", label: "In review" }, { value: "approved", label: "Approved" }, { value: "scheduled", label: "Scheduled" }]} />
                <div className="ml-auto flex items-center gap-1 rounded-[0.4rem] border border-grey-light p-0.5 dark:border-grey-light/15">
                    <button type="button" onClick={() => setDense(false)} aria-label="Comfortable rows" className={cn("flex h-7 w-7 items-center justify-center rounded-[0.3rem] transition-colors", !dense ? "bg-primary text-white" : "text-grey hover:text-black dark:hover:text-white")}>
                        <Stroke d={PATHS.rows} className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDense(true)} aria-label="Compact rows" className={cn("flex h-7 w-7 items-center justify-center rounded-[0.3rem] transition-colors", dense ? "bg-primary text-white" : "text-grey hover:text-black dark:hover:text-white")}>
                        <Stroke d={PATHS.list} className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Groups */}
            {rows === null ? (
                <div className="flex flex-col gap-3">
                    {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-lavender-mist/60 dark:bg-dark-3/40" />)}
                </div>
            ) : groups.length === 0 ? (
                <Card className="flex flex-col items-center gap-3 py-14 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
                        <Stroke d={PATHS.check} color="#00B894" className="h-6 w-6" />
                    </span>
                    <h3 className="text-title text-black dark:text-white">Nothing in the queue</h3>
                    <p className="max-w-md text-caption-2 text-grey">{all.length ? "No items match your filters." : "No scheduled, ready-to-publish, or in-review content right now."}</p>
                </Card>
            ) : (
                groups.map((g, gi) => (
                    <section key={g.key}>
                        <div className="mb-3 flex items-center gap-2">
                            <h2 className="text-h6 text-black dark:text-white">{g.label}</h2>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-lavender-mist px-1.5 text-[0.6875rem] font-bold text-primary dark:bg-dark-3 dark:text-lilac">{g.items.length}</span>
                        </div>
                        <div className="flex flex-col gap-3">
                            {g.items.map((item, li) => (
                                <motion.div
                                    key={item.id}
                                    initial={reduce ? false : { opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: reduce ? 0 : gi * 0.06 + li * 0.04, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <QueueRow
                                        item={item}
                                        dense={dense}
                                        busy={busyId === item.id}
                                        onPublish={() => void publishNow(item.id)}
                                        onSchedule={() => setScheduleFor(item.id)}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    </section>
                ))
            )}

            <ScheduleModal open={!!scheduleFor} onClose={() => setScheduleFor(null)} onSchedule={(_label, iso) => void doSchedule(iso)} />
        </div>
    );
};

const Stat = ({ icon, color, value, label }: { icon: string; color: string; value: number; label: string }) => (
    <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}1a` }}>
            <Stroke d={icon} color={color} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
            <CountUp value={value} className="font-poppins text-[1.5rem] leading-none font-extrabold text-black dark:text-white" />
            <div className="mt-1 truncate text-caption-2 text-grey">{label}</div>
        </div>
    </div>
);

/* ---------------- row ---------------- */

const StepBar = ({ current, color }: { current: number; color: string }) => (
    <div className="w-full max-w-[32rem]">
        <div className="flex items-center">
            {STEPS.map((s, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <Fragment key={s}>
                        <span
                            className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                                done ? "border-success bg-success" : active ? "bg-white dark:bg-dark-1" : "border-grey-light bg-white dark:border-grey-light/25 dark:bg-dark-1",
                            )}
                            style={active ? { borderColor: color } : undefined}
                        >
                            {done ? (
                                <Stroke d={PATHS.check} color="#fff" className="h-2.5 w-2.5" />
                            ) : active ? (
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                            ) : null}
                        </span>
                        {i < STEPS.length - 1 && (
                            <span className={cn("h-0.5 flex-1 rounded-full", i < current ? "bg-success" : "bg-grey-light dark:bg-grey-light/20")} />
                        )}
                    </Fragment>
                );
            })}
        </div>
        <div className="mt-1.5 flex justify-between">
            {STEPS.map((s, i) => (
                <span key={s} className={cn("text-[0.625rem] leading-none", i <= current ? "font-medium text-grey" : "text-grey/55")}>{s}</span>
            ))}
        </div>
    </div>
);

const QueueRow = ({
    item,
    dense,
    busy,
    onPublish,
    onSchedule,
}: {
    item: Row;
    dense: boolean;
    busy: boolean;
    onPublish: () => void;
    onSchedule: () => void;
}) => {
    const href = `/content/editor?id=${item.id}`;
    const tColor = typeColor(item.type);
    const sColor = STATUS_COLOR[item.status];
    const current = STATUS_INDEX[item.status];

    return (
        <div className={cn("group relative flex flex-col overflow-hidden rounded-2xl bg-white pl-5 shadow-[0_0.5rem_1.5rem_rgba(227,230,236,0.45)] transition-shadow hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.1)] dark:bg-dark-1 dark:shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.25)]", dense ? "gap-0 p-3 pl-5" : "gap-4 p-5 pl-5")}>
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: sColor }} />

            {/* header row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {/* time / date */}
            <div className="flex w-14 shrink-0 flex-col">
                <span className="font-poppins text-body font-bold leading-tight text-black dark:text-white">{item.time ?? "TBD"}</span>
                <span className="text-caption-2 text-grey">{item.date}</span>
            </div>

            {/* type + title + author */}
            <div className="min-w-0 grow basis-56">
                <span className="inline-flex items-center rounded-[0.4rem] px-2 py-0.5 text-caption-2 font-semibold" style={{ backgroundColor: `${tColor}1a`, color: tColor }}>{item.type}</span>
                <Link href={href} className="mt-1.5 block truncate text-title font-semibold text-black transition-colors hover:text-primary dark:text-white dark:hover:text-lilac">{item.title}</Link>
                <div className="mt-1.5 flex items-center gap-2">
                    <Avatar size={22} userId={item.author.id} character={item.author.avatarStyle} src={item.author.avatarUrl} name={item.author.name} />
                    <span className="text-caption-2 text-black dark:text-white">{item.author.name}</span>
                    {item.author.title && <span className="text-caption-2 text-grey">· {item.author.title}</span>}
                </div>
            </div>

            {/* status pill */}
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[0.5rem] px-2.5 py-1 text-caption-2 font-semibold" style={{ backgroundColor: `${sColor}1a`, color: sColor }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: sColor }} />
                {STATUS_LABEL[item.status]}
            </span>

            {/* action */}
            <div className="flex shrink-0 items-center gap-1.5">
                {item.status === "review" && (
                    <Link href={href} className="btn-primary btn-sm"><Stroke d={PATHS.eye} className="h-4 w-4 text-white" />Review</Link>
                )}
                {item.status === "approved" && (
                    <button type="button" onClick={onSchedule} disabled={busy} className="btn-secondary btn-sm disabled:opacity-60"><Stroke d={PATHS.calendar} className="h-4 w-4" />Schedule</button>
                )}
                {item.status === "scheduled" && (
                    <button type="button" onClick={onPublish} disabled={busy} className="btn-primary btn-sm disabled:opacity-60"><Stroke d={PATHS.send} className="h-4 w-4 text-white" />{busy ? "Publishing..." : "Publish now"}</button>
                )}

                <Menu as="div" className="relative">
                    <Menu.Button aria-label="More actions" className="flex h-9 w-9 items-center justify-center rounded-[0.4rem] text-grey transition-colors hover:bg-lavender-mist hover:text-black dark:hover:bg-dark-3 dark:hover:text-white">
                        <Stroke d={PATHS.dots} className="h-5 w-5" />
                    </Menu.Button>
                    <Transition as={Fragment} enter="transition ease-out duration-150" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="transition ease-in duration-100" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                        <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right overflow-hidden rounded-xl border border-grey-light bg-white p-1.5 shadow-[0_1rem_2.5rem_rgba(26,26,46,0.14)] focus:outline-none dark:border-grey-light/15 dark:bg-dark-1">
                            <Menu.Item>
                                {({ active }) => (
                                    <Link href={href} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm text-black dark:text-white", active && "bg-lavender-mist dark:bg-dark-3")}>
                                        <Stroke d={PATHS.eye} className="h-4 w-4 text-grey" />Open in editor
                                    </Link>
                                )}
                            </Menu.Item>
                            {item.status !== "review" && (
                                <Menu.Item>
                                    {({ active }) => (
                                        <button type="button" onClick={onSchedule} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm text-black dark:text-white", active && "bg-lavender-mist dark:bg-dark-3")}>
                                            <Stroke d={PATHS.calendar} className="h-4 w-4 text-grey" />{item.status === "scheduled" ? "Reschedule" : "Schedule"}
                                        </button>
                                    )}
                                </Menu.Item>
                            )}
                            {item.status === "scheduled" && (
                                <Menu.Item>
                                    {({ active }) => (
                                        <button type="button" onClick={onPublish} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-body-sm text-black dark:text-white", active && "bg-lavender-mist dark:bg-dark-3")}>
                                            <Stroke d={PATHS.send} className="h-4 w-4 text-grey" />Publish now
                                        </button>
                                    )}
                                </Menu.Item>
                            )}
                        </Menu.Items>
                    </Transition>
                </Menu>
            </div>
            </div>

            {/* timeline — its own row below, aligned past the time column
                (hidden on the narrowest screens where 5 labels would cramp) */}
            {!dense && (
                <div className="hidden sm:block sm:pl-[4.75rem]">
                    <StepBar current={current} color={sColor} />
                </div>
            )}
        </div>
    );
};

export default QueuePage;
