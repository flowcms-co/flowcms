"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import ScoreRing from "@/components/ui/ScoreRing";
import CountUp from "@/components/motion/CountUp";
import EmptyState from "@/components/ui/EmptyState";
import LiveBadge from "../seo/LiveBadge";
import { api } from "@/lib/api";
import { useConnections } from "@/lib/useConnections";
import { issueCounts, ratingOf, scoreCta } from "@/lib/seoDash";

type ScoreResp = { hasData: boolean; score: number | null };
type IssuesResp = { counts: { total: number; pages: number }; groups: { severity: "high" | "med" | "low"; count: number }[] };

const Arrow = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
);

/**
 * SEO health card: the canonical FlowCMS SEO Score (same /seo/score the SEO suite
 * shows) as a ring, with critical and warning counts from the same issue set the
 * AI Optimizer lists (/seo/scan/issues), so the two always agree. The score blends
 * Search Console, the live crawl and PageSpeed; the counts come from the page
 * audit, and the card says so. Loading, error and no-access are their own states:
 * none of them renders as a zero.
 */
const SeoCard = () => {
    const router = useRouter();
    const { forbidden } = useConnections();
    const [score, setScore] = useState<number | null>(null);
    const [counts, setCounts] = useState<{ critical: number; warnings: number } | null>(null);
    const [site, setSite] = useState<string | null | undefined>(undefined);
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const [countsFailed, setCountsFailed] = useState(false);

    useEffect(() => {
        api<ScoreResp>("/seo/score")
            .then((d) => d.hasData && d.score != null && setScore(d.score))
            .catch(() => setFailed(true))
            .finally(() => setLoaded(true));
        api<IssuesResp>("/seo/scan/issues")
            .then((d) => setCounts(issueCounts(d.groups ?? [])))
            .catch(() => setCountsFailed(true));
        api<{ site?: string | null }>("/seo/connectors").then((d) => setSite(d.site ?? null)).catch(() => {});
    }, []);

    const value = score ?? 0;
    const { label, color } = ratingOf(value);

    const shell = (badge: string, body: React.ReactNode) => (
        <Card className="flex h-full flex-col !p-6">
            <div className="flex items-center gap-2">
                <h2 className="text-h5 text-black dark:text-white">SEO Health</h2>
                <span className="ml-auto"><LiveBadge live={false} source="FlowCMS score" reason={badge} /></span>
            </div>
            <div className="flex grow flex-col items-center justify-center py-6">{body}</div>
        </Card>
    );

    if (!loaded) return shell("Loading", <div className="h-[156px] w-[156px] animate-pulse rounded-full bg-lavender-mist dark:bg-dark-3" aria-label="Loading SEO score" />);
    if (forbidden.seo) return shell("No access", <EmptyState variant="bare" icon="search" title="No access" description="You don't have access to this data." />);
    if (failed) return shell("Couldn't load", <EmptyState variant="bare" icon="search" title="Couldn't load the SEO score" description="Something went wrong fetching the score. Reload to try again." />);
    // Loaded with no score yet: say what is needed instead of fabricating a number.
    if (score == null) {
        const cta = scoreCta(site, false);
        return shell(site === null ? "No site URL" : "No score yet", <EmptyState variant="bare" icon="search" title={cta.title} description={cta.description} action={cta.href ? { label: cta.label!, href: cta.href } : undefined} />);
    }

    return (
        <Card className="flex h-full flex-col !p-6">
            <div className="flex items-center gap-2">
                <h2 className="text-h5 text-black dark:text-white">SEO Health</h2>
                <span className="ml-auto"><LiveBadge live={score != null} source="FlowCMS score" /></span>
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
                    {label}
                </span>
            </div>

            {/* Issue counts — taller tiles that use the card's spare height (the ring
                section above flexes), without growing the card itself. */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-error/[0.06] px-4 py-4 dark:bg-error/10">
                    <div className="text-caption-1 font-semibold text-error">Critical issues</div>
                    {counts ? <CountUp value={counts.critical} className="mt-1.5 block font-poppins text-h3 font-bold text-black dark:text-white" /> : <span className="mt-1.5 block font-poppins text-h3 font-bold text-grey">{"\u2014"}</span>}
                    <div className="mt-1 text-caption-2 text-grey">Need immediate attention</div>
                </div>
                <div className="rounded-2xl bg-warning/[0.12] px-4 py-4 dark:bg-warning/10">
                    <div className="text-caption-1 font-semibold text-[#B26B00] dark:text-warning">Warnings</div>
                    {counts ? <CountUp value={counts.warnings} className="mt-1.5 block font-poppins text-h3 font-bold text-black dark:text-white" /> : <span className="mt-1.5 block font-poppins text-h3 font-bold text-grey">{"\u2014"}</span>}
                    <div className="mt-1 text-caption-2 text-grey">Should be addressed</div>
                </div>
            </div>

            <p className="mt-2.5 text-caption-2 leading-relaxed text-grey">
                {countsFailed ? "Couldn't load the issue counts. " : ""}Score: Search Console, live crawl and PageSpeed. Counts: the page audit, as in the AI Optimizer.
            </p>
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
