"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import StatNumber from "@/components/motion/StatNumber";
import { useDashboardSummary } from "@/lib/useDashboard";
import { api } from "@/lib/api";

/* Outline (lucide-style) icons, drawn inline for precise sizing/colour. */
const PATHS = {
    send: "M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z",
    check: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
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
    href: string;
};

type SeoSummary = { hasData: boolean; conflicts?: number; strikingDistance?: number };

/**
 * Top KPI strip on the overview — Ready to publish / In review / Scheduled / SEO
 * issues. Counts are live from the role-aware dashboard summary (+ /seo/summary
 * for the SEO issue count). We keep no per-metric daily history, so the cards
 * show the real current count only (no fabricated week-over-week deltas or
 * sparklines).
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
    // Real counts (0 on a fresh install).
    const kpis: Kpi[] = [
        { key: "ready", label: "Ready to publish", value: p?.approved ?? 0, icon: PATHS.send, color: "#6C5CE7", href: "/content/queue" },
        { key: "review", label: "In review", value: p?.review ?? 0, icon: PATHS.check, color: "#00B894", href: "/content?status=review" },
        { key: "scheduled", label: "Scheduled", value: p?.scheduled ?? 0, icon: PATHS.calendar, color: "#E91E63", href: "/content?status=scheduled" },
        { key: "seo", label: "SEO issues", value: seoIssues ?? 0, icon: PATHS.alert, color: "#F59E0B", href: "/seo" },
    ];

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {kpis.map((k) => (
                <Link key={k.key} href={k.href} aria-label={`${k.label}: ${k.value}`} className="group block rounded-2xl">
                <Card className="flex flex-col !p-4 transition-shadow group-hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.08)]">
                    {/* One horizontal row: icon · number · label. */}
                    <div className="flex items-center gap-3">
                        <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                            style={{ backgroundColor: `${k.color}1f` }}
                        >
                            <Stroke d={k.icon} color={k.color} className="h-[17px] w-[17px]" />
                        </span>
                        <StatNumber value={String(k.value)} className="font-poppins text-[1.5rem] leading-none font-extrabold text-black dark:text-white" />
                        <span className="min-w-0 truncate text-[0.875rem] font-semibold text-black dark:text-white">{k.label}</span>
                    </div>
                </Card>
                </Link>
            ))}
        </div>
    );
};

export default KpiStrip;
