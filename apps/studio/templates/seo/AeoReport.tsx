"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import ScoreRing from "@/components/ui/ScoreRing";
import BrandIcon from "@/components/ui/BrandIcon";
import { resolveBrand } from "@/lib/brands";
import CountUp from "@/components/motion/CountUp";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

/* ---------------- data shapes (mirror /seo/aeo + /seo/audit) ---------------- */

type Engine = { id: string; name: string; citedQueries: number; totalQueries: number; runs: number; share: number };
type MatrixRow = { query: string; cells: { engine: string; timesCited: number; runs: number }[] };
type Referral = { platform: string; sessions: number };
type AeoResp = { hasData: boolean; brand?: string; engines?: Engine[]; matrix?: MatrixRow[]; referral?: Referral[] };
type AuditLive = {
    hasData: boolean;
    jsonLdRows?: { type: string }[];
    files?: {
        robots: { present: boolean; hasSitemapRef: boolean; blocksAiBots: boolean };
        sitemap: { present: boolean; urls: number };
        llmsTxt: { present: boolean };
    };
};

const ENGINES = [
    { key: "chatgpt", name: "ChatGPT", color: "#10A37F", match: /chatgpt|openai|gpt/i },
    { key: "perplexity", name: "Perplexity", color: "#20808D", match: /perplex/i },
    { key: "gemini", name: "Gemini", color: "#4285F4", match: /gemini|google|bard/i },
    { key: "claude", name: "Claude", color: "#D97757", match: /claude|anthropic/i },
];
const engineMeta = (name: string) => ENGINES.find((e) => e.match.test(name)) ?? ENGINES[0];
const gradeOf = (s: number) => (s < 30 ? "Very difficult" : s < 50 ? "Difficult" : s < 60 ? "Fair" : "Good");

const PATHS = {
    arrowLeft: "M19 12H5M11 18l-6-6 6-6",
    check: "M20 6 9 17l-5-5",
    x: "M18 6 6 18M6 6l12 12",
    sparkle: "M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z",
};
const Stroke = ({ d, color, className }: { d: string; color?: string; className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);
const Mark = ({ name, color }: { name: string; color: string }) => {
    if (resolveBrand(name)) return <BrandIcon brand={name} size={32} rounded="rounded-xl" label={name} />;
    return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-poppins text-caption-1 font-bold" style={{ backgroundColor: `${color}1f`, color }}>
            {name[0]}
        </span>
    );
};
const StatusBadge = ({ on }: { on: boolean }) => (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold", on ? "bg-success/12 text-[#0a7a5f] dark:text-success" : "bg-error/10 text-[#c0453f] dark:text-[#FF8A80]")}>{on ? "Mentioned" : "Not mentioned"}</span>
);
const SampleTag = () => <span className="inline-flex items-center rounded-md bg-grey-light/60 px-2 py-0.5 text-[0.6875rem] font-semibold text-grey dark:bg-dark-3">Sample data</span>;

/* Longer deterministic samples so "view all" reads as the full list. */
const SAMPLE_Q = [
    { q: "What is the best headless CMS?", e: "ChatGPT", mentioned: true, pos: "Position #3" },
    { q: "Best CMS for SEO", e: "Perplexity", mentioned: true, pos: "Position #2" },
    { q: "Best CMS with AI tools", e: "Gemini", mentioned: false, pos: "" },
    { q: "Headless CMS for agencies", e: "Claude", mentioned: true, pos: "Position #5" },
    { q: "Open source CMS with a public API", e: "ChatGPT", mentioned: true, pos: "Position #4" },
    { q: "Strapi alternatives", e: "Perplexity", mentioned: true, pos: "Position #1" },
    { q: "Self-hosted CMS for marketing teams", e: "Gemini", mentioned: false, pos: "" },
    { q: "CMS with built-in SEO and AEO", e: "Claude", mentioned: true, pos: "Position #2" },
    { q: "Best CMS for a brand studio", e: "ChatGPT", mentioned: true, pos: "Position #6" },
    { q: "Which CMS has the best AI writing tools?", e: "Perplexity", mentioned: false, pos: "" },
];
const SAMPLE_REFERRAL = [
    { platform: "ChatGPT", sessions: 71 },
    { platform: "Perplexity", sessions: 38 },
    { platform: "Gemini", sessions: 22 },
    { platform: "Claude", sessions: 12 },
];
const SAMPLE_RECS = [
    { title: "Add FAQ schema", sub: "Helps AI answer engines quote you directly", est: "+8%" },
    { title: "Generate llms.txt", sub: "Guides AI crawlers to your best pages", est: "+15%" },
    { title: "Add Organization schema", sub: "Strengthens your brand entity in AI", est: "+6%" },
    { title: "Add comparison content", sub: "AI engines favour clear comparisons", est: "+5%" },
    { title: "Improve answer-style headings", sub: "Question-shaped H2s get cited more", est: "+4%" },
];

const ReadinessRow = ({ label, ok, hint }: { label: string; ok: boolean; hint: string }) => (
    <div className="flex items-center gap-3 rounded-xl border border-grey-light px-3.5 py-2.5 dark:border-grey-light/10">
        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", ok ? "bg-success/15" : "bg-error/12")}>
            <Stroke d={ok ? PATHS.check : PATHS.x} color={ok ? "#00B894" : "#E0529C"} className="h-3 w-3" />
        </span>
        <div className="min-w-0 grow">
            <div className="text-body-sm font-medium text-black dark:text-white">{label}</div>
            <div className="truncate text-caption-2 text-grey">{hint}</div>
        </div>
        <span className={cn("shrink-0 text-caption-2 font-semibold", ok ? "text-[#0a7a5f] dark:text-success" : "text-[#c0453f] dark:text-[#FF8A80]")}>{ok ? "Found" : "Missing"}</span>
    </div>
);

const AeoReport = () => {
    const [aeo, setAeo] = useState<AeoResp | null>(null);
    const [audit, setAudit] = useState<AuditLive | null>(null);

    useEffect(() => {
        api<AeoResp>("/seo/aeo").then(setAeo).catch(() => {});
        api<AuditLive>("/seo/audit").then((d) => d.hasData && setAudit(d)).catch(() => {});
    }, []);

    const liveAeo = !!aeo?.hasData && (aeo?.matrix?.length ?? 0) > 0;
    const questions = useMemo(() => {
        if (liveAeo && aeo?.matrix?.length) {
            return aeo.matrix.map((row) => {
                const top = [...row.cells].sort((a, b) => b.timesCited - a.timesCited)[0];
                const meta = top ? engineMeta(top.engine) : ENGINES[0];
                return { q: row.query, e: meta.name, color: meta.color, mentioned: row.cells.some((c) => c.timesCited > 0), pos: "" };
            });
        }
        return SAMPLE_Q.map((s) => ({ ...s, color: engineMeta(s.e).color }));
    }, [aeo, liveAeo]);

    const referral = (aeo?.referral?.length ? aeo.referral : SAMPLE_REFERRAL).map((r) => ({ ...r, color: engineMeta(r.platform).color }));
    const referralLive = (aeo?.referral?.length ?? 0) > 0;
    const referralTotal = referral.reduce((s, r) => s + r.sessions, 0);

    const files = audit?.files;
    const hasFaq = (audit?.jsonLdRows ?? []).some((r) => /FAQPage/i.test(r.type));
    const hasSchema = (audit?.jsonLdRows ?? []).some((r) => r.type && r.type !== "—");
    const liveAudit = !!audit;
    const readiness = liveAudit
        ? [
              { label: "llms.txt", ok: !!files?.llmsTxt.present, hint: files?.llmsTxt.present ? "Found at /llms.txt" : "Not found: generate one" },
              { label: "Robots.txt", ok: !!files?.robots.present, hint: files?.robots.present ? (files.robots.blocksAiBots ? "Found, but blocks an AI bot" : "Found, AI bots allowed") : "Not found" },
              { label: "Sitemap", ok: !!files?.sitemap.present, hint: files?.sitemap.present ? `${files.sitemap.urls} URLs` : "Not found" },
              { label: "FAQ Schema", ok: hasFaq, hint: hasFaq ? "FAQPage detected" : "Add FAQPage schema" },
              { label: "JSON-LD", ok: hasSchema, hint: hasSchema ? "Structured data detected" : "No JSON-LD found" },
          ]
        : [
              { label: "llms.txt", ok: false, hint: "Not found: generate one" },
              { label: "Robots.txt", ok: true, hint: "Found, AI bots allowed" },
              { label: "Sitemap", ok: true, hint: "Found" },
              { label: "FAQ Schema", ok: false, hint: "Add FAQPage schema" },
              { label: "JSON-LD", ok: true, hint: "Structured data detected" },
          ];
    const passing = readiness.filter((r) => r.ok).length;
    const readinessScore = Math.round((passing / readiness.length) * 100);
    const scoreColor = readinessScore >= 80 ? "#00B894" : readinessScore >= 50 ? "#F5A623" : "#E0529C";

    return (
        <div className="flex flex-col gap-6">
            <Link href="/seo/aeo-geo" className="inline-flex w-fit items-center gap-1.5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                <Stroke d={PATHS.arrowLeft} className="h-4 w-4" />
                Back to AEO / GEO
            </Link>

            {/* Tracked questions */}
            <Card id="questions" className="scroll-mt-6">
                <div className="mb-4 flex items-center gap-2">
                    <h2 className="text-h5 text-black dark:text-white">Tracked questions</h2>
                    {!liveAeo && <SampleTag />}
                    <span className="ml-auto text-caption-2 text-grey">{questions.length} questions</span>
                </div>
                <div className="flex flex-col gap-2">
                    {questions.map((q, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-xl border border-grey-light p-2.5 dark:border-grey-light/10">
                            <Mark name={q.e} color={q.color} />
                            <div className="min-w-0 grow">
                                <div className="truncate text-body-sm font-medium text-black dark:text-white">{q.q}</div>
                                <div className="mt-0.5 truncate text-caption-2 text-grey">{q.e}{q.mentioned && q.pos ? ` · ${q.pos}` : ""}</div>
                            </div>
                            <StatusBadge on={q.mentioned} />
                        </div>
                    ))}
                </div>
            </Card>

            {/* Prompt monitoring */}
            <Card id="prompts" className="scroll-mt-6 !p-0 overflow-hidden">
                <div className="flex items-center gap-2 p-5">
                    <h2 className="text-h5 text-black dark:text-white">Prompt monitoring</h2>
                    {!liveAeo && <SampleTag />}
                </div>
                <div className="grid grid-cols-[1fr_4rem_8rem] items-center gap-3 border-y border-grey-light px-5 py-2.5 text-caption-2 text-grey dark:border-grey-light/10">
                    <span>Prompt</span>
                    <span className="text-center">Engine</span>
                    <span className="text-right">Status</span>
                </div>
                {questions.map((q, i) => (
                    <div key={i} className="grid grid-cols-[1fr_4rem_8rem] items-center gap-3 border-b border-grey-light/60 px-5 py-3 last:border-b-0 dark:border-grey-light/10">
                        <span className="min-w-0 truncate text-body-sm text-black dark:text-white">{q.q}</span>
                        <span className="flex justify-center"><Mark name={q.e} color={q.color} /></span>
                        <span className="flex justify-end"><StatusBadge on={q.mentioned} /></span>
                    </div>
                ))}
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {/* Readiness */}
                <Card id="readiness" className="scroll-mt-6 flex flex-col">
                    <div className="mb-4 flex items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">AI readiness</h2>
                        {!liveAudit && <SampleTag />}
                    </div>
                    <div className="flex items-center gap-5">
                        <ScoreRing value={readinessScore} label="/ 100" size={120} color={scoreColor} valueClassName="font-poppins text-[2rem] font-extrabold leading-none text-black dark:text-white" />
                        <p className="text-body-sm text-grey">{readinessScore >= 80 ? "Your site is well-optimized for AI visibility." : `${passing} of ${readiness.length} checks passing. ${gradeOf(readinessScore)} readiness.`}</p>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                        {readiness.map((r) => (
                            <ReadinessRow key={r.label} label={r.label} ok={r.ok} hint={r.hint} />
                        ))}
                    </div>
                </Card>

                {/* Referral */}
                <Card id="referral" className="scroll-mt-6 flex flex-col">
                    <div className="mb-4 flex items-center gap-2">
                        <h2 className="text-h5 text-black dark:text-white">AI referral traffic</h2>
                        {!referralLive && <SampleTag />}
                    </div>
                    <div className="flex items-baseline gap-2">
                        <CountUp value={referralTotal} className="font-poppins text-[2rem] leading-none font-extrabold text-black dark:text-white" />
                        <span className="text-caption-2 text-grey">visits from AI assistants</span>
                    </div>
                    <div className="mt-4 flex flex-col gap-2.5">
                        {referral.map((r) => {
                            const pct = referralTotal ? Math.round((r.sessions / referralTotal) * 100) : 0;
                            return (
                                <div key={r.platform}>
                                    <div className="flex items-center justify-between text-caption-2">
                                        <span className="font-medium text-black dark:text-white">{r.platform}</span>
                                        <span className="text-grey">{r.sessions} · {pct}%</span>
                                    </div>
                                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-grey-light/70 dark:bg-grey-light/10">
                                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: r.color }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            {/* Recommendations */}
            <Card id="recommendations" className="scroll-mt-6">
                <div className="mb-4 flex items-center gap-2">
                    <h2 className="text-h5 text-black dark:text-white">Recommendations</h2>
                    <SampleTag />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {SAMPLE_RECS.map((r) => (
                        <div key={r.title} className="flex items-center gap-3 rounded-2xl border border-grey-light p-3 dark:border-grey-light/10">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:text-lilac">
                                <Stroke d={PATHS.sparkle} className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 grow">
                                <div className="truncate text-body-sm font-semibold text-black dark:text-white">{r.title}</div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-caption-2 text-grey">
                                    <span className="inline-flex items-center rounded bg-success/12 px-1.5 font-semibold text-[#0a7a5f] dark:text-success">{r.est}</span>
                                    <span className="truncate">{r.sub}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <Link href="/seo/optimizer" className="mt-4 inline-flex w-fit items-center gap-1.5 text-caption-1 font-semibold text-primary transition-opacity hover:opacity-70 dark:text-lilac">
                    Open the AI Auditor for live fixes
                    <Stroke d="M5 12h14M13 6l6 6-6 6" className="h-3.5 w-3.5" />
                </Link>
            </Card>
        </div>
    );
};

export default AeoReport;
