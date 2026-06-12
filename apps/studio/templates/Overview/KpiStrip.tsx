"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Sparkline from "@/components/charts/Sparkline";
import StatNumber from "@/components/motion/StatNumber";
import { useDashboardSummary } from "@/lib/useDashboard";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/* Outline (lucide-style) icons, drawn inline for precise sizing/colour. */
const PATHS = {
    send: "M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z",
    check: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    arrowUp: "M12 19V5M5 12l7-7 7 7",
    arrowDown: "M12 5v14M19 12l-7 7-7-7",
};

const Stroke = ({ d, className, color }: { d: string; className?: string; color?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);

type Kpi = {
    key: string;
    label: string;
    value: number;
    icon: string;
    color: string;
    delta: string;
    dir: "up" | "down";
    spark: number[];
    href: string;
};

type SeoSummary = { hasData: boolean; conflicts?: number; strikingDistance?: number };

/**
 * Top KPI strip on the overview — Ready to publish / In review / Scheduled / SEO
 * issues. Counts are live from the role-aware dashboard summary (+ /seo/summary
 * for the SEO issue count); the week-over-week deltas and sparklines are
 * illustrative trend texture (no historical series is stored).
 */
const KpiStrip = () => {
    const summary = useDashboardSummary();
    const [seoIssues, setSeoIssues] = useState<number | null>(null);

    useEffect(() => {
        api<SeoSummary>("/seo/summary")
            .then((d) => d.hasData && setSeoIssues((d.conflicts ?? 0) + (d.strikingDistance ?? 0)))
            .catch(() => {});
    }, []);

    const p = summary?.pipeline;
    // Real counts (0 on a fresh install). The week-over-week deltas + sparklines
    // are illustrative trend texture (no historical series is stored).
    const kpis: Kpi[] = [
        { key: "ready", label: "Ready to publish", value: p?.approved ?? 0, icon: PATHS.send, color: "#6C5CE7", delta: "24%", dir: "up", spark: [8, 10, 9, 12, 11, 14, 13, 16, 18], href: "/content/queue" },
        { key: "review", label: "In review", value: p?.review ?? 0, icon: PATHS.check, color: "#00B894", delta: "8%", dir: "down", spark: [11, 10, 12, 9, 11, 8, 10, 8, 7], href: "/content?status=review" },
        { key: "scheduled", label: "Scheduled", value: p?.scheduled ?? 0, icon: PATHS.calendar, color: "#E91E63", delta: "15%", dir: "up", spark: [6, 8, 7, 9, 8, 11, 10, 11, 12], href: "/content?status=scheduled" },
        { key: "seo", label: "SEO issues", value: seoIssues ?? 0, icon: PATHS.alert, color: "#F59E0B", delta: "12%", dir: "down", spark: [9, 8, 9, 7, 8, 6, 7, 6, 5], href: "/seo" },
    ];

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {kpis.map((k) => (
                <Link key={k.key} href={k.href} aria-label={`${k.label}: ${k.value}`} className="group block rounded-2xl">
                <Card className="flex flex-col !p-4 transition-shadow group-hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.08)]">
                    {/* One horizontal row: icon · number · label · delta (right). */}
                    <div className="flex items-center gap-2">
                        <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                            style={{ backgroundColor: `${k.color}1f` }}
                        >
                            <Stroke d={k.icon} color={k.color} className="h-[15px] w-[15px]" />
                        </span>
                        <StatNumber value={String(k.value)} className="font-poppins text-[1.25rem] leading-none font-extrabold text-black dark:text-white" />
                        <span className="min-w-0 truncate text-[0.875rem] font-semibold text-black dark:text-white">{k.label}</span>
                        <span className={cn("ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap text-caption-2 font-semibold", k.dir === "up" ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#E17055]")}>
                            <Stroke d={k.dir === "up" ? PATHS.arrowUp : PATHS.arrowDown} className="h-3 w-3" />
                            <span>{k.delta}</span>
                        </span>
                    </div>

                    <div className="mt-3 -mb-1">
                        <Sparkline data={k.spark} color={k.color} height={34} />
                    </div>
                </Card>
                </Link>
            ))}
        </div>
    );
};

export default KpiStrip;
