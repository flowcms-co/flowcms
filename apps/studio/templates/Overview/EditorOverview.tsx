"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { CircularProgressbarWithChildren, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import Card from "@/components/ui/Card";
import CountUp from "@/components/motion/CountUp";
import MetricBar from "@/components/ui/MetricBar";
import Sparkline from "@/components/charts/Sparkline";
import { useDashboardSummary, type DashboardSummary, type WorkItem } from "@/lib/useDashboard";
import { useRevealBatch } from "@/lib/useReveal";

/* Inline outline icons for precise sizing/colour (lucide-style). */
const PATHS = {
    edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    check: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
    arrowUp: "M12 19V5M5 12l7-7 7 7",
    sparkles: "M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z",
    pen: "M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-1.5M2 2l7.586 7.586",
    wand: "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h0M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5",
    doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
    clockSmall: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2",
    chevronRight: "M9 18l6-6-6-6",
    chevronDown: "M6 9l6 6 6-6",
    plus: "M12 5v14M5 12h14",
    arrowRight: "M5 12h14M13 6l6 6-6 6",
};

const Stroke = ({ d, color, className }: { d: string; color?: string; className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);

const relTime = (iso?: string) => {
    if (!iso) return "";
    const h = Math.floor((Date.now() - +new Date(iso)) / 3_600_000);
    if (h < 24) return h < 1 ? "just now" : "today";
    const d = Math.floor(h / 24);
    return d === 1 ? "yesterday" : `${d} days ago`;
};
const dayLabel = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

/** Honest empty "my work" snapshot, shown on a fresh install / before this user
 *  has authored anything (the cards each render their own empty state from it). */
const EMPTY_MY: DashboardSummary["my"] = {
    drafts: 0,
    inReview: 0,
    scheduled: 0,
    dueToday: 0,
    published30d: 0,
    publishedThisWeek: 0,
    publishedLastWeek: 0,
    aiGenerations: 0,
    tasks: [],
    work: { dueToday: [], inProgress: [], scheduled: [] },
    recentlyPublished: [],
    contentMix: { published: 0, inReview: 0, drafts: 0, scheduled: 0 },
    insights: { wordsThisMonth: 0 },
    weekly: { done: 0, published: 0, scheduled: 0, target: 5, topic: null, streakDays: 0, week: [false, false, false, false, false, false, false] },
};

const EditorOverview = () => {
    const summary = useDashboardSummary();
    // Real per-user data once loaded; honest zeroes while loading / on a fresh
    // install. Each card renders its own empty state from these values.
    const my = summary?.my ?? EMPTY_MY;

    const scope = useRef<HTMLDivElement>(null);
    useRevealBatch(scope);

    return (
        <div ref={scope} className="flex flex-col gap-6">
            <div className="reveal-up">
                <EditorKpis my={my} />
            </div>

            <div className="reveal-up grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[65fr_35fr]">
                <MyWork work={my.work} />
                <div className="flex flex-col gap-6">
                    <WeeklyGoalCard weekly={my.weekly} />
                    <AiAssistantCard />
                </div>
            </div>

            <div className="reveal-up grid grid-cols-1 gap-6 xl:grid-cols-3">
                <RecentlyPublished items={my.recentlyPublished} />
                <ContentActivity mix={my.contentMix} />
                <WritingInsights wordsThisMonth={my.insights.wordsThisMonth} />
            </div>
        </div>
    );
};

/* ---------------- KPI strip (same base design as the super-admin KPI cards) ---------------- */

const EditorKpis = ({ my }: { my: DashboardSummary["my"] }) => {
    const pubDelta = my.publishedThisWeek - my.publishedLastWeek;
    // Same base design as the super-admin KPI strip: tinted icon · number · label ·
    // (real) delta on one row, with a small trend line beneath. The number is real;
    // the sparkline is light trend texture (we keep no per-metric daily history).
    const kpis = [
        { key: "due", icon: PATHS.edit, color: "#6C5CE7", value: my.dueToday, label: "Due today", delta: null as number | null, spark: [1, 2, 1, 2, 3, 2, 3, 2, Math.max(1, my.dueToday)], href: "/content?author=me" },
        { key: "prog", icon: PATHS.clock, color: "#F5A623", value: my.drafts, label: "In progress", delta: null, spark: [3, 4, 3, 5, 4, 6, 5, 6, Math.max(1, my.drafts)], href: "/content?status=draft&author=me" },
        { key: "sched", icon: PATHS.calendar, color: "#00B894", value: my.scheduled, label: "Scheduled", delta: null, spark: [1, 1, 2, 1, 2, 3, 2, 3, Math.max(1, my.scheduled)], href: "/content?status=scheduled&author=me" },
        { key: "pub", icon: PATHS.sparkles, color: "#E91E63", value: my.publishedThisWeek, label: "Published this week", delta: pubDelta, spark: [2, 3, 2, 4, 3, 5, 4, my.publishedLastWeek || 4, Math.max(1, my.publishedThisWeek)], href: "/content?status=published&author=me" },
    ];
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {kpis.map((k) => {
                const up = (k.delta ?? 0) >= 0;
                return (
                    <Link key={k.key} href={k.href} aria-label={`${k.label}: ${k.value}`} className="group block rounded-2xl">
                        <Card className="flex flex-col !p-4 transition-shadow group-hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.08)]">
                            <div className="flex items-center gap-2">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105" style={{ backgroundColor: `${k.color}1f` }}>
                                    <Stroke d={k.icon} color={k.color} className="h-[15px] w-[15px]" />
                                </span>
                                <CountUp value={k.value} className="font-poppins text-[1.25rem] leading-none font-extrabold text-black dark:text-white" />
                                <span className="min-w-0 truncate text-[0.875rem] font-semibold text-black dark:text-white">{k.label}</span>
                                {k.delta != null && k.delta !== 0 && (
                                    <span className={`ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap text-caption-2 font-semibold ${up ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#E17055]"}`}>
                                        <Stroke d={PATHS.arrowUp} className={`h-3 w-3 ${up ? "" : "rotate-180"}`} />
                                        {Math.abs(k.delta)}
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 -mb-1">
                                <Sparkline data={k.spark} color={k.color} height={34} />
                            </div>
                        </Card>
                    </Link>
                );
            })}
        </div>
    );
};

/* ---------------- My work ---------------- */

// Icon per group; the icon TINT rotates through a soft palette by item position
// (coral, green, blue) so the list reads with the same colour rhythm as the design.
const GROUP_ICON: Record<string, string> = { due: PATHS.edit, prog: PATHS.doc, sched: PATHS.calendar };
const ITEM_PALETTE = ["#F2655C", "#00B894", "#3B82F6"];
const STATE_CTA: Record<string, string> = { review: "Review", draft: "Continue", scheduled: "View", live: "View" };
// How many items to show per group, so the card height stays in step with the
// Weekly-goal + AI-assistant column beside it (the rest live behind "View all").
const PER_GROUP = 2;

const MyWork = ({ work }: { work: DashboardSummary["my"]["work"] }) => {
    const groups: { key: string; label: string; items: WorkItem[] }[] = [
        { key: "due", label: "Due Today", items: work.dueToday },
        { key: "prog", label: "In Progress", items: work.inProgress },
        { key: "sched", label: "Scheduled", items: work.scheduled },
    ].filter((g) => g.items.length > 0);

    // Continuous index across all shown items so the colour rhythm doesn't reset
    // per group (matches the reference: coral, green, blue, coral, green ...).
    let idx = -1;

    return (
        <Card className="flex h-full flex-col !p-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-h5 text-black dark:text-white">My work</h2>
                <Link href="/content?author=me" className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                    View all tasks
                    <Stroke d={PATHS.arrowRight} className="h-3.5 w-3.5" />
                </Link>
            </div>

            {groups.length === 0 ? (
                <div className="flex grow flex-col items-center justify-center gap-2 py-12 text-center">
                    <Stroke d={PATHS.check} color="#00B894" className="h-8 w-8" />
                    <p className="text-body-sm text-black dark:text-white">All caught up</p>
                    <p className="text-caption-2 text-grey">Nothing on your plate right now.</p>
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-5">
                        {groups.map((g) => (
                            <div key={g.key}>
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="text-caption-1 font-semibold text-black dark:text-white">{g.label}</span>
                                    <span className="rounded-md bg-lavender-mist px-1.5 text-caption-2 font-semibold text-grey dark:bg-dark-3">{g.items.length}</span>
                                </div>
                                <div className="flex flex-col gap-2.5">
                                    {g.items.slice(0, PER_GROUP).map((t) => {
                                        idx += 1;
                                        const color = ITEM_PALETTE[idx % ITEM_PALETTE.length];
                                        const cta = STATE_CTA[t.state] ?? "Open";
                                        const isReview = cta === "Review";
                                        return (
                                            <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-grey-light p-3.5 transition-shadow hover:shadow-[0_0.5rem_1.5rem_rgba(227,230,236,0.5)] dark:border-grey-light/10">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1f` }}>
                                                    <Stroke d={GROUP_ICON[g.key] ?? PATHS.edit} color={color} className="h-4 w-4" />
                                                </span>
                                                <div className="min-w-0 grow">
                                                    <div className="truncate text-body-sm font-medium text-black dark:text-white">{t.title}</div>
                                                    <div className="mt-0.5 text-caption-2 text-grey">
                                                        {t.type} &middot; {g.key === "sched" ? dayLabel(t.due) : g.key === "due" ? "Due today" : relTime(t.due)}
                                                    </div>
                                                </div>
                                                {isReview ? (
                                                    <Link href="/content/editor" className="shrink-0 inline-flex h-8 items-center justify-center rounded-[0.4rem] bg-[#F2655C]/12 px-3 text-caption-1 font-semibold text-[#D8463C] transition-colors hover:bg-[#F2655C]/20 dark:text-[#FF8A80]">
                                                        Review
                                                    </Link>
                                                ) : (
                                                    <Link href="/content/editor" className="btn-secondary btn-sm shrink-0">
                                                        {cta}
                                                    </Link>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                    <Link href="/content?author=me" className="mt-auto flex items-center justify-center gap-1.5 pt-5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                        <Stroke d={PATHS.plus} className="h-3.5 w-3.5" />
                        View all tasks
                    </Link>
                </>
            )}
        </Card>
    );
};

/* ---------------- Weekly goal (animated + motivating) ---------------- */

function motivation(pct: number): { line: string; tone: "celebrate" | "good" | "push" } {
    if (pct >= 100) return { line: "Goal smashed! Incredible work this week. 🎉", tone: "celebrate" };
    if (pct >= 75) return { line: "So close, one more push to hit it!", tone: "good" };
    if (pct >= 40) return { line: "You’re on fire! Keep up the momentum.", tone: "good" };
    if (pct > 0) return { line: "Great start, let’s build on it.", tone: "push" };
    return { line: "Fresh week, fresh goal. Publish your first to get rolling!", tone: "push" };
}

/** A gold achievement cup (drawn, not an emoji) — the centrepiece of the ring. */
const Trophy = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <defs>
            <linearGradient id="flowCup" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFE7A0" />
                <stop offset="52%" stopColor="#F7B733" />
                <stop offset="100%" stopColor="#E0941A" />
            </linearGradient>
            <linearGradient id="flowCupBase" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F7B733" />
                <stop offset="100%" stopColor="#D2860E" />
            </linearGradient>
        </defs>
        {/* handles */}
        <path d="M15 15 C5 15 6 31 19 31" fill="none" stroke="#E89B1C" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M49 15 C59 15 58 31 45 31" fill="none" stroke="#E89B1C" strokeWidth="3.4" strokeLinecap="round" />
        {/* bowl */}
        <path d="M16 11 H48 V21 C48 32.5 41 39 32 39 C23 39 16 32.5 16 21 Z" fill="url(#flowCup)" />
        {/* stem + base */}
        <rect x="29" y="38.5" width="6" height="8" fill="url(#flowCupBase)" />
        <path d="M22.5 51 C22.5 48.5 26 47 32 47 C38 47 41.5 48.5 41.5 51 Z" fill="url(#flowCupBase)" />
        <rect x="20" y="51" width="24" height="4.4" rx="2.2" fill="url(#flowCupBase)" />
        {/* star */}
        <path d="M32 17.2 l2.1 4.3 4.8 .6 -3.5 3.2 .9 4.7 -4.3 -2.3 -4.3 2.3 .9 -4.7 -3.5 -3.2 4.8 -.6 Z" fill="#FFF6D6" />
        {/* shine */}
        <path d="M20.5 13 h5 v2.6 c-2.6 1 -4.2 3.6 -4.4 6.4 h-2 c-.7 -5.2 .9 -8 1.4 -9 Z" fill="#FFFFFF" opacity="0.32" />
    </svg>
);

// One-shot burst pieces — fixed (deterministic) directions so they fan out evenly
// from the cup, then clear. tx/ty are px offsets the keyframe animates toward.
const BURST = [
    { tx: -92, ty: -64, rot: 200, c: "#6C5CE7", w: 6, h: 10 },
    { tx: 92, ty: -60, rot: -190, c: "#00B894", w: 10, h: 6 },
    { tx: -116, ty: 6, rot: 150, c: "#F5A623", w: 6, h: 10 },
    { tx: 118, ty: 2, rot: -150, c: "#E91E63", w: 9, h: 6 },
    { tx: -74, ty: 76, rot: 130, c: "#3B82F6", w: 6, h: 9 },
    { tx: 78, ty: 80, rot: -130, c: "#A29BFE", w: 9, h: 6 },
    { tx: -34, ty: -96, rot: 210, c: "#00B894", w: 6, h: 9 },
    { tx: 36, ty: -94, rot: -200, c: "#F5A623", w: 8, h: 6 },
    { tx: 2, ty: 94, rot: 140, c: "#6C5CE7", w: 6, h: 9 },
    { tx: -132, ty: -26, rot: 170, c: "#E91E63", w: 8, h: 6 },
    { tx: 128, ty: -28, rot: -160, c: "#3B82F6", w: 6, h: 9 },
    { tx: -52, ty: -44, rot: 190, c: "#FFD166", w: 7, h: 7 },
    { tx: 56, ty: 44, rot: -170, c: "#A29BFE", w: 7, h: 7 },
    { tx: 20, ty: -58, rot: 150, c: "#00B894", w: 6, h: 9 },
];

const WeeklyGoalCard = ({ weekly }: { weekly: DashboardSummary["my"]["weekly"] }) => {
    const target = Math.max(1, weekly.target);
    const pct = Math.min(100, Math.round((weekly.done / target) * 100));
    const [shown, setShown] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setShown(pct), 150);
        return () => clearTimeout(t);
    }, [pct]);

    const met = pct >= 100;
    // Celebration plays ONCE when the goal is met (on reach / on load), then clears
    // so the card sits in its calm, normal state with no lingering confetti.
    const [burst, setBurst] = useState(false);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- play the burst once on reach/mount, then clear
        setBurst(met);
        if (!met) return;
        const t = setTimeout(() => setBurst(false), 1900);
        return () => clearTimeout(t);
    }, [met]);

    const ringColor = pct >= 40 ? "#00B894" : "#F5A623";
    const { line, tone } = motivation(pct);
    const half = Math.ceil(target / 2);
    const nextMilestone = weekly.done < half ? { count: half, label: "50%" } : { count: target, label: "100%" };
    const toneClass =
        tone === "celebrate" || tone === "good"
            ? "bg-success/10 text-[#0a7a5f] dark:text-success"
            : "bg-warning/10 text-[#B26B00] dark:text-warning";

    return (
        <Card className="relative flex flex-col overflow-hidden !p-6">
            <div className="relative flex items-center justify-between gap-2">
                <h2 className="text-h5 text-black dark:text-white">Weekly goal</h2>
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-orange/10 px-2.5 py-1 text-caption-2 font-semibold text-orange">
                    {weekly.streakDays}-day streak 🔥
                </span>
            </div>
            {weekly.topic && <div className="relative mt-1 text-caption-2 text-grey">Focus: {weekly.topic}</div>}

            <div className="relative mx-auto mt-2 h-[136px] w-[136px]">
                {/* One-shot confetti burst around the cup (only when the goal is met). */}
                {burst && (
                    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-0 w-0">
                        {BURST.map((p, i) => (
                            <span
                                key={i}
                                className="absolute animate-flow-burst rounded-[1px]"
                                style={{
                                    left: 0,
                                    top: 0,
                                    width: p.w,
                                    height: p.h,
                                    backgroundColor: p.c,
                                    "--tx": `${p.tx}px`,
                                    "--ty": `${p.ty}px`,
                                    "--rot": `${p.rot}deg`,
                                    animationDelay: `${i * 22}ms`,
                                } as CSSProperties}
                            />
                        ))}
                    </div>
                )}
                <CircularProgressbarWithChildren value={shown} strokeWidth={9} styles={buildStyles({ pathColor: ringColor, trailColor: `${ringColor}1f`, pathTransitionDuration: 1.1, strokeLinecap: "round" })}>
                    <Trophy className="h-[58px] w-[58px] animate-flow-pop drop-shadow-[0_3px_6px_rgba(224,148,26,0.35)] motion-reduce:animate-none" />
                </CircularProgressbarWithChildren>
            </div>

            <div className="relative mt-4 text-center">
                <div className="font-poppins text-h4 font-bold text-black dark:text-white">
                    <CountUp value={weekly.done} /> of {target} this week
                </div>
                <div className="mt-0.5 text-caption-2 text-grey">
                    {pct}% complete &middot; {weekly.published} published, {weekly.scheduled} scheduled
                </div>
            </div>

            <div className="relative mt-3">
                <MetricBar percent={pct} color={ringColor} trackClassName="h-2 rounded-pill bg-grey-light/70 dark:bg-grey-light/10" barClassName="rounded-pill" />
            </div>

            <div className="relative mt-4 flex items-center justify-between rounded-2xl border border-grey-light p-3.5 dark:border-grey-light/10">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-lilac">
                        <Stroke d={PATHS.sparkles} className="h-4 w-4" />
                    </span>
                    <div>
                        <div className="text-caption-2 text-grey">Next milestone</div>
                        <div className="text-caption-1 font-semibold text-black dark:text-white">{nextMilestone.count} published</div>
                    </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-caption-1 font-semibold text-grey">{nextMilestone.label} 🎁</span>
            </div>

            <div className={`relative mt-3 rounded-2xl px-4 py-2.5 text-center text-caption-1 font-semibold ${toneClass}`}>{line}</div>
        </Card>
    );
};

/* ---------------- AI assistant ---------------- */

const AiChip = ({ label, icon, href, className = "" }: { label: string; icon: string; href: string; className?: string }) => (
    <Link
        href={href}
        className={`flex items-center gap-2.5 rounded-2xl bg-white/15 px-3.5 py-2.5 text-caption-1 font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25 ${className}`}
    >
        <Stroke d={icon} className="h-4 w-4 shrink-0 text-white" />
        {label}
    </Link>
);

/** Editor AI assistant — purple gradient "glass" card (matches the supplied design). */
const AiAssistantCard = () => (
    <div className="relative overflow-hidden rounded-3xl p-5 shadow-[0_0.75rem_2rem_rgba(108,92,231,0.4)] bg-[linear-gradient(135deg,#6C5CE7_0%,#8674F0_42%,#B673D6_78%,#E0529C_120%)]">
        {/* soft light blooms for glass depth */}
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-white/10 blur-3xl" />

        <div className="relative">
            <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                    <Stroke d={PATHS.sparkles} className="h-5 w-5 text-white" />
                </span>
                <div>
                    <h2 className="font-poppins text-[1.125rem] font-semibold leading-tight text-white">AI assistant</h2>
                    <p className="text-caption-2 text-white/75">Write faster with AI</p>
                </div>
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
                <AiChip label="Improve writing" icon={PATHS.sparkles} href="/ai/proofreading" />
                <div className="grid grid-cols-2 gap-2.5">
                    <AiChip label="Make shorter" icon={PATHS.chevronDown} href="/ai/proofreading" />
                    <AiChip label="Expand" icon={PATHS.plus} href="/ai" />
                    <AiChip label="Rephrase" icon={PATHS.pen} href="/ai/proofreading" />
                    <AiChip label="Translate" icon={PATHS.globe} href="/ai" />
                </div>
            </div>

            <Link
                href="/content/editor"
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[0.9375rem] font-bold text-primary shadow-sm transition-transform active:scale-[0.985]"
            >
                <Stroke d={PATHS.plus} className="h-5 w-5 text-primary" />
                New Content
            </Link>
        </div>
    </div>
);

/* ---------------- Recently published (no thumbnails) ---------------- */

const STATUS_BADGE = "rounded-pill bg-success/12 px-2 py-0.5 text-caption-2 font-semibold text-[#0a7a5f] dark:text-success";

const RecentlyPublished = ({ items }: { items: DashboardSummary["my"]["recentlyPublished"] }) => (
    <Card className="flex flex-col !p-6">
        <div className="mb-4 flex items-center justify-between">
            <h2 className="text-h5 text-black dark:text-white">Recently published</h2>
            <Link href="/content?status=published&author=me" className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                View all
                <Stroke d={PATHS.arrowRight} className="h-3.5 w-3.5" />
            </Link>
        </div>
        {items.length === 0 ? (
            <p className="py-8 text-center text-caption-2 text-grey">Nothing published yet. Your wins will show up here.</p>
        ) : (
            <div className="flex flex-col">
                {items.map((p, i) => (
                    <Link key={p.id} href="/content/editor" className={`flex items-start justify-between gap-3 py-3 ${i > 0 ? "border-t border-grey-light dark:border-grey-light/10" : ""}`}>
                        <div className="min-w-0">
                            <div className="truncate text-body-sm font-medium text-black dark:text-white">{p.title}</div>
                            <div className="mt-0.5 text-caption-2 text-grey">{p.type} &middot; {relTime(p.publishedAt)}</div>
                        </div>
                        <span className={`${STATUS_BADGE} shrink-0`}>Published</span>
                    </Link>
                ))}
            </div>
        )}
    </Card>
);

/* ---------------- Content activity (donut) ---------------- */

const ContentActivity = ({ mix }: { mix: DashboardSummary["my"]["contentMix"] }) => {
    const rows = [
        { label: "Published", value: mix.published, color: "#00B894" },
        { label: "In review", value: mix.inReview, color: "#F5A623" },
        { label: "Drafts", value: mix.drafts, color: "#A29BFE" },
        { label: "Scheduled", value: mix.scheduled, color: "#E91E63" },
    ];
    const total = rows.reduce((s, r) => s + r.value, 0);
    const data = total > 0 ? rows.filter((r) => r.value > 0) : [{ label: "None", value: 1, color: "#ECEAF5" }];

    return (
        <Card className="flex flex-col !p-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-h5 text-black dark:text-white">Content activity</h2>
                <span className="rounded-pill bg-lavender-mist px-2.5 py-0.5 text-caption-2 font-medium text-grey dark:bg-dark-3">This month</span>
            </div>

            <div className="relative mx-auto h-[164px] w-[164px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <PieChart>
                        <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius="86%" outerRadius="100%" startAngle={90} endAngle={-270} paddingAngle={total > 0 ? 1.5 : 0} cornerRadius={8} stroke="none" animationDuration={900}>
                            {data.map((d) => (
                                <Cell key={d.label} fill={d.color} style={{ outline: "none" }} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-poppins text-[2.5rem] font-bold leading-none text-black dark:text-white">
                        <CountUp value={total} />
                    </span>
                    <span className="mt-1 text-caption-1 text-grey">Total</span>
                </div>
            </div>

            <div className="mt-5 flex grow flex-col justify-between gap-1">
                {rows.map((r) => (
                    <div key={r.label} className="flex items-center gap-2.5 border-b border-grey-light/60 py-2 last:border-b-0 dark:border-grey-light/10">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: r.color }} />
                        <span className="grow text-body-sm text-grey">{r.label}</span>
                        <span className="font-poppins text-body font-bold tabular-nums text-black dark:text-white">{r.value}</span>
                        <span className="w-12 text-right text-caption-1 font-medium text-grey">{total > 0 ? Math.round((r.value / total) * 100) : 0}%</span>
                    </div>
                ))}
            </div>

            <Link href="/content" className="mt-4 inline-flex items-center gap-1.5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                View full report
                <Stroke d={PATHS.arrowRight} className="h-3.5 w-3.5" />
            </Link>
        </Card>
    );
};

/* ---------------- Writing insights ---------------- */

const WritingInsights = ({ wordsThisMonth }: { wordsThisMonth: number }) => {
    const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`);
    const rows = [
        { icon: PATHS.pen, color: "#3B82F6", value: fmt(wordsThisMonth), label: "Words written", delta: "18%", up: true },
        { icon: PATHS.clockSmall, color: "#00B894", value: "2h 34m", label: "Avg. writing time", delta: "8%", up: false, sample: true },
        { icon: PATHS.sparkles, color: "#6C5CE7", value: "89%", label: "AI assistance rate", delta: "12%", up: true, sample: true },
        { icon: PATHS.check, color: "#F5A623", value: "4", label: "Content pieces improved", delta: "2", up: true, sample: true },
    ];
    return (
        <Card className="flex flex-col !p-6">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-h5 text-black dark:text-white">Writing insights</h2>
                <span className="text-caption-2 text-grey">This month</span>
            </div>
            <div className="flex grow flex-col justify-between">
                {rows.map((r, i) => (
                    <div key={r.label} className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-grey-light/60 dark:border-grey-light/10" : ""}`}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${r.color}1f` }}>
                            <Stroke d={r.icon} color={r.color} className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 grow">
                            <div className="font-poppins text-[1.25rem] leading-none font-bold text-black dark:text-white">{r.value}</div>
                            <div className="mt-1 text-caption-2 text-grey">
                                {r.label}
                                {r.sample && <span className="ml-1 text-grey/60">· sample</span>}
                            </div>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-0.5 text-caption-2 font-semibold ${r.up ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#E17055]"}`}>
                            <Stroke d={PATHS.arrowUp} className={`h-3 w-3 ${r.up ? "" : "rotate-180"}`} />
                            {r.delta}
                        </span>
                    </div>
                ))}
            </div>
            <Link href="/ai/usage" className="mt-4 inline-flex items-center gap-1.5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                View all insights
                <Stroke d={PATHS.arrowRight} className="h-3.5 w-3.5" />
            </Link>
        </Card>
    );
};

export default EditorOverview;
