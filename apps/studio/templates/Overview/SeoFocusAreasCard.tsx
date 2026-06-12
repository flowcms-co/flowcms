"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import ScoreRing from "@/components/ui/ScoreRing";
import EmptyState from "@/components/ui/EmptyState";
import { api } from "@/lib/api";

const bandFor = (s: number) => (s >= 80 ? "Strong" : s >= 70 ? "Good" : s >= 50 ? "Fair" : "Poor");
const colorFor = (s: number) => (s >= 70 ? "#00B894" : s >= 50 ? "#F5A623" : "#E5484D");

const Arrow = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
);

type Pillar = { key: string; title: string; desc: string; href: string };

/* All four pillars are real scores: Visibility / Technical / Speed come from
   /seo/score, AI Visibility from /seo/aeo. We only render a ring once the real
   score for that pillar exists (no fabricated defaults). */
const PILLARS: Pillar[] = [
    { key: "visibility", title: "Search Visibility", desc: "Clicks and rankings from Search Console.", href: "/seo" },
    { key: "technical", title: "Technical Health", desc: "Crawlability, metadata and structured data.", href: "/seo/optimizer" },
    { key: "speed", title: "Core Web Vitals", desc: "Loading, interactivity and layout shift.", href: "/seo" },
    { key: "ai", title: "AI Visibility", desc: "Presence across AI answer engines.", href: "/seo/aeo-geo" },
];

const SeoFocusAreasCard = () => {
    const [scores, setScores] = useState<Record<string, number>>({});

    useEffect(() => {
        void api<{ hasData: boolean; pillars?: { key: string; score: number | null }[] }>("/seo/score")
            .then((d) => {
                const next: Record<string, number> = {};
                for (const key of ["visibility", "technical", "speed"]) {
                    const v = d.pillars?.find((p) => p.key === key)?.score;
                    if (v != null) next[key] = v;
                }
                if (Object.keys(next).length) setScores((s) => ({ ...s, ...next }));
            })
            .catch(() => {});
        void api<{ hasData: boolean; score?: number }>("/seo/aeo")
            .then((d) => {
                if (d.hasData && typeof d.score === "number") setScores((s) => ({ ...s, ai: d.score as number }));
            })
            .catch(() => {});
    }, []);

    const hasAnyScore = PILLARS.some((p) => p.key in scores);

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className="font-poppins text-h5 font-semibold text-black dark:text-white">SEO Focus Areas</h2>
                <p className="mt-0.5 text-caption-2 text-grey">High-level view of key SEO pillars</p>
            </div>

            {!hasAnyScore ? (
                <Card className="!p-6">
                    <EmptyState
                        variant="bare"
                        icon="search"
                        title="No pillar scores yet"
                        description="Run a scan and connect your sources to score search visibility, technical health, Core Web Vitals and AI visibility."
                        action={{ label: "Run a scan", href: "/seo/optimizer" }}
                    />
                </Card>
            ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                {PILLARS.map((p) => {
                    const score = scores[p.key];
                    const has = score != null;
                    const color = has ? colorFor(score) : "#9999B0";
                    const band = has ? bandFor(score) : "Not scored";
                    return (
                        <Card key={p.key} className="flex flex-col items-center !p-5 text-center transition-shadow hover:shadow-[0_0.75rem_2rem_rgba(26,26,46,0.08)]">
                            <h3 className="font-poppins text-title font-semibold text-black dark:text-white">{p.title}</h3>
                            <div className="mt-3">
                                <ScoreRing value={has ? score : 0} size={108} color={color} label="/ 100" />
                            </div>
                            <span
                                className="mt-3 inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-caption-2 font-semibold"
                                style={{ backgroundColor: `${color}1f`, color }}
                            >
                                {has && <Stroke className="h-3 w-3" />}
                                {band}
                            </span>
                            <p className="mt-3 text-caption-2 text-grey">{p.desc}</p>
                            <Link href={p.href} className="mt-3 inline-flex items-center gap-1.5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                                View details
                                <Arrow className="h-3.5 w-3.5" />
                            </Link>
                        </Card>
                    );
                })}
            </div>
            )}

            {/* Deeper-dive banner */}
            <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-primary/[0.06] p-5 dark:bg-primary/[0.12] sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-primary dark:text-lilac">
                            <path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7L12 3z" />
                        </svg>
                    </span>
                    <div>
                        <div className="text-title font-semibold text-primary dark:text-lilac">Want a deeper dive?</div>
                        <p className="mt-0.5 text-caption-2 text-grey">Explore detailed reports, audits and tools in the SEO suite.</p>
                    </div>
                </div>
                <Link href="/seo" className="btn-primary btn-md shrink-0 gap-2">
                    Go to SEO suite
                    <Arrow className="h-4 w-4 fill-none stroke-white" />
                </Link>
            </div>
        </div>
    );
};

/** Small up-tick used inside the band pill. */
const Stroke = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M5 14l7-7 7 7" />
    </svg>
);

export default SeoFocusAreasCard;
