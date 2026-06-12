"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import ScoreRing from "@/components/ui/ScoreRing";
import CountUp from "@/components/motion/CountUp";
import EmptyState from "@/components/ui/EmptyState";
import LiveBadge from "../seo/LiveBadge";
import { api } from "@/lib/api";

type ScoreResp = { hasData: boolean; score: number | null };
type Finding = { severity: 1 | 2 | 3 };
type PageAudit = { findings: Finding[] };

const rating = (s: number) => (s >= 80 ? "Good" : s >= 60 ? "Fair" : "Needs work");
const ringColor = (s: number) => (s >= 80 ? "#00B894" : s >= 60 ? "#F59E0B" : "#EF4444");

const Arrow = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
);

/**
 * SEO health card — the canonical Flow SEO Score (same /seo/score the SEO suite
 * shows) as a circular progress ring, with critical-issue and warning counts from
 * the live audit ledger (/seo/scan). Shows a "Run a scan" empty state until a
 * score exists. The footer links to the full AI Auditor report.
 */
const SeoCard = () => {
    const router = useRouter();
    const [score, setScore] = useState<number | null>(null);
    const [counts, setCounts] = useState<{ critical: number; warnings: number } | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        api<ScoreResp>("/seo/score")
            .then((d) => d.hasData && d.score != null && setScore(d.score))
            .catch(() => {})
            .finally(() => setLoaded(true));
        api<PageAudit[]>("/seo/scan")
            .then((pages) => {
                if (!pages.length) return;
                let critical = 0;
                let warnings = 0;
                for (const p of pages) for (const f of p.findings) {
                    if (f.severity === 3) critical++;
                    else if (f.severity === 2) warnings++;
                }
                setCounts({ critical, warnings });
            })
            .catch(() => {});
    }, []);

    const value = score ?? 0;
    const color = ringColor(value);
    const critical = counts?.critical ?? 0;
    const warnings = counts?.warnings ?? 0;

    // Loaded with no score yet: prompt a scan instead of fabricating a number.
    if (loaded && score == null) {
        return (
            <Card className="flex h-full flex-col !p-6">
                <div className="flex items-center gap-2">
                    <h2 className="text-h5 text-black dark:text-white">SEO Health</h2>
                    <span className="ml-auto"><LiveBadge live={false} source="Flow score" /></span>
                </div>
                <div className="flex grow flex-col items-center justify-center py-6">
                    <EmptyState
                        variant="bare"
                        icon="search"
                        title="No SEO score yet"
                        description="Run a scan to see your Flow SEO Score, critical issues and warnings."
                        action={{ label: "Run a scan", href: "/seo/optimizer" }}
                    />
                </div>
            </Card>
        );
    }

    return (
        <Card className="flex h-full flex-col !p-6">
            <div className="flex items-center gap-2">
                <h2 className="text-h5 text-black dark:text-white">SEO Health</h2>
                <span className="ml-auto"><LiveBadge live={score != null} source="Flow score" /></span>
            </div>

            {/* Ring + rating — vertically centered so the card height-matches the
                Search performance card beside it. */}
            <div className="flex grow flex-col items-center justify-center py-3">
                <ScoreRing
                    value={value}
                    size={156}
                    color={color}
                    label="/ 100"
                    valueClassName="font-poppins text-[2.6rem] font-bold leading-none text-black dark:text-white"
                />
                <span
                    className="mt-3.5 inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-caption-1 font-semibold"
                    style={{ backgroundColor: `${color}1f`, color }}
                >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {rating(value)}
                </span>
            </div>

            {/* Issue counts — taller tiles that use the card's spare height (the ring
                section above flexes), without growing the card itself. */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-error/[0.06] px-4 py-4 dark:bg-error/10">
                    <div className="text-caption-1 font-semibold text-error">Critical issues</div>
                    <CountUp value={critical} className="mt-1.5 block font-poppins text-h3 font-bold text-black dark:text-white" />
                    <div className="mt-1 text-caption-2 text-grey">Need immediate attention</div>
                </div>
                <div className="rounded-2xl bg-warning/[0.12] px-4 py-4 dark:bg-warning/10">
                    <div className="text-caption-1 font-semibold text-[#B26B00] dark:text-warning">Warnings</div>
                    <CountUp value={warnings} className="mt-1.5 block font-poppins text-h3 font-bold text-black dark:text-white" />
                    <div className="mt-1 text-caption-2 text-grey">Should be addressed</div>
                </div>
            </div>

            <button
                type="button"
                onClick={() => router.push("/seo/optimizer")}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary/[0.08] px-4 py-2.5 text-body-sm font-semibold text-primary transition-colors hover:bg-primary/[0.14] dark:bg-primary/15 dark:text-lilac dark:hover:bg-primary/25"
            >
                View full SEO health report
                <Arrow className="h-4 w-4" />
            </button>
        </Card>
    );
};

export default SeoCard;
