"use client";

import { useEffect, useState } from "react";
import { runProgress, type RunState } from "@/lib/seoDash";
import Link from "next/link";
import Card from "@/components/ui/Card";
import StatNumber from "@/components/motion/StatNumber";
import { useDashboard } from "@/lib/useDashboard";
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
    /** null = nothing to show (no access, no data, or the fetch failed): a dash, never 0. */
    value: number | null;
    icon: string;
    color: string;
    href: string;
};

/** The one issue total the Optimizer shows (`/seo/scan/issues`). */
type IssuesTotal = { counts?: { total?: number }; run?: RunState | null };

/** What a tile shows: a pulse while loading, a dash when there is no number. */
export const kpiDisplay = (value: number | null, loading: boolean): "loading" | "none" | number => (loading ? "loading" : value == null ? "none" : value);

/**
 * Top KPI strip on the overview: Ready to publish / In review / Scheduled / SEO
 * issues. Counts are live (the pipeline from the dashboard summary, the issue
 * total from the SEO Optimizer). No deltas or trend lines: no history is stored
 * to compute them from.
 */
const KpiStrip = () => {
    const { data: summary, loading, error } = useDashboard();
    // undefined = still loading, null = no data / no access / failed.
    const [seoIssues, setSeoIssues] = useState<number | null | undefined>(undefined);
    // An audit in progress: the total covers only the pages checked so far.
    const [seoRun, setSeoRun] = useState<RunState | null>(null);

    useEffect(() => {
        api<IssuesTotal>("/seo/scan/issues")
            .then((d) => {
                setSeoIssues(typeof d.counts?.total === "number" ? d.counts.total : null);
                setSeoRun(d.run ?? null);
            })
            .catch(() => setSeoIssues(null));
    }, []);

    const p = summary?.pipeline;
    const kpis: Kpi[] = [
        { key: "ready", label: "Ready to publish", value: p?.approved ?? null, icon: PATHS.send, color: "#6C5CE7", href: "/content/queue" },
        { key: "review", label: "In review", value: p?.review ?? null, icon: PATHS.check, color: "#00B894", href: "/content?status=review" },
        { key: "scheduled", label: "Scheduled", value: p?.scheduled ?? null, icon: PATHS.calendar, color: "#E91E63", href: "/content?status=scheduled" },
        { key: "seo", label: "SEO issues", value: seoIssues ?? null, icon: PATHS.alert, color: "#F59E0B", href: "/seo" },
    ];

    return (
        <div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                {kpis.map((k) => {
                    const shown = kpiDisplay(k.value, k.key === "seo" ? seoIssues === undefined : loading);
                    return (
                        <Link key={k.key} href={k.href} aria-label={`${k.label}: ${shown === "loading" ? "loading" : shown === "none" ? "not available" : shown}`} className="group block rounded-2xl">
                            <Card className="flex flex-col !p-4 transition-shadow group-hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.08)]">
                                {/* One horizontal row: icon · number · label. */}
                                <div className="flex items-center gap-2">
                                    <span
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
                                        style={{ backgroundColor: `${k.color}1f` }}
                                    >
                                        <Stroke d={k.icon} color={k.color} className="h-[15px] w-[15px]" />
                                    </span>
                                    {shown === "loading" ? (
                                        <span className="h-5 w-8 animate-pulse rounded-md bg-grey-light/70 dark:bg-dark-3" aria-hidden />
                                    ) : shown === "none" ? (
                                        <span className="font-poppins text-[1.25rem] leading-none font-extrabold text-grey" title={k.key === "seo" ? "No SEO scan data available" : "Not available"}>&ndash;</span>
                                    ) : (
                                        <StatNumber value={String(shown)} className="font-poppins text-[1.25rem] leading-none font-extrabold text-black dark:text-white" />
                                    )}
                                    <span className="hidden min-w-0 truncate text-[0.875rem] font-semibold text-black sm:block dark:text-white">{k.label}</span>
                                </div>

                                {/* Mobile: label sits under the number (the row is too narrow at 2-up). */}
                                <span className="mt-1.5 min-w-0 truncate text-[0.8125rem] font-semibold text-black sm:hidden dark:text-white">{k.label}</span>
                                {k.key === "seo" && runProgress(seoRun) && (
                                    <span role="status" className="mt-1.5 min-w-0 truncate text-caption-2 text-grey">{runProgress(seoRun)}</span>
                                )}
                            </Card>
                        </Link>
                    );
                })}
            </div>
            {error && !summary && <p className="mt-2 text-caption-2 text-error" role="alert">Couldn&rsquo;t load the content counts. Reload to try again.</p>}
            {summary?.perLocale && <p className="mt-2 text-caption-2 text-grey">Counts are per locale: each translation of a piece is counted on its own.</p>}
        </div>
    );
};

export default KpiStrip;
