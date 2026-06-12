"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import ConnectNotice from "@/components/ai/ConnectNotice";
import { api } from "@/lib/api";
import { checkGrammar, readabilityScore, checkOriginality, type CorpusPage } from "@/lib/textTools";
import { useAiProviders, runAi, aiErrorMessage } from "@/lib/useAi";
import { cn } from "@/lib/cn";

const PATHS = {
    sparkle: "M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7L12 3z",
    link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
    edit: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
    copy: "M8 8h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2zM4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2",
    chevron: "M9 18l6-6-6-6",
    check: "M20 6 9 17l-5-5",
};

const Stroke = ({ d, className, color }: { d: string; className?: string; color?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
        {d.split("M").filter(Boolean).map((seg, i) => (
            <path key={i} d={"M" + seg} />
        ))}
    </svg>
);

type Entry = { id: string; title: string; data: Record<string, unknown> | null };
type Opp = { sourceId: string };
type LinkScan = { opportunities?: Opp[] };

type Page = { id: string; title: string };
type Suggestion = { key: string; title: string; desc: string; icon: string; color: string; href: string; pages: Page[] };

/** Scan a capped set of the most recent published pages so the dashboard stays snappy. */
const SCAN_LIMIT = 40;
/** Flesch Reading Ease below this reads as "hard"; flag it. */
const READABILITY_FLOOR = 60;

const plainBody = (e: Entry) =>
    String((e.data as { body?: string } | null)?.body ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const s = (n: number) => (n === 1 ? "" : "s");

/** Icon chip + title + description, shared by the link/expand row variants. */
const Head = ({ item }: { item: Suggestion }) => (
    <>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${item.color}1f` }}>
            <Stroke d={item.icon} color={item.color} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 grow">
            <div className="text-body-sm font-semibold text-black dark:text-white">{item.title}</div>
            <p className="mt-0.5 text-caption-2 text-grey">{item.desc}</p>
        </div>
    </>
);

/**
 * Quick suggestions — actionable fixes for the workspace's own content. The
 * default "Auto" mode runs deterministic, no-cost scans (readability, grammar,
 * duplicate passages, internal-link opportunities) over the latest published
 * pages and links each finding to where it's fixed. "AI" mode runs a deeper,
 * semantic review via the connected provider (opt-in, uses credits).
 */
const QuickSuggestionsCard = () => {
    const [mode, setMode] = useState<"auto" | "ai">("auto");
    const [scanning, setScanning] = useState(true);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [openKey, setOpenKey] = useState<string | null>(null);

    // Context the AI scan summarises.
    const [titles, setTitles] = useState<string[]>([]);
    const [counts, setCounts] = useState({ readability: 0, grammar: 0, duplicates: 0, links: 0 });

    // AI mode.
    const { providerId, model, hasProvider, loading: aiLoading } = useAiProviders();
    const [aiBusy, setAiBusy] = useState(false);
    const [aiError, setAiError] = useState("");
    const [aiTips, setAiTips] = useState<string[] | null>(null);

    useEffect(() => {
        let off = false;
        (async () => {
            const [entries, links] = await Promise.all([
                api<Entry[]>("/entries?status=PUBLISHED").catch(() => [] as Entry[]),
                api<LinkScan>("/seo/internal-links").catch(() => ({}) as LinkScan),
            ]);
            if (off) return;
            const scanned = entries
                .slice(0, SCAN_LIMIT)
                .map((e) => ({ id: e.id, title: e.title || "Untitled", text: plainBody(e) }))
                .filter((e) => e.text.length >= 60);
            const corpus: CorpusPage[] = scanned.map((e) => ({ title: e.title, body: e.text }));

            const lowRead: Page[] = [];
            const grammar: Page[] = [];
            const dupes: Page[] = [];
            scanned.forEach((e, i) => {
                if (readabilityScore(e.text) < READABILITY_FLOOR) lowRead.push({ id: e.id, title: e.title });
                if (checkGrammar(e.text).issues.length > 0) grammar.push({ id: e.id, title: e.title });
                const others = corpus.filter((_, j) => j !== i);
                if (checkOriginality(e.text, others).notes.some((n) => n.severity !== "low")) dupes.push({ id: e.id, title: e.title });
            });
            const opps = links.opportunities?.length ?? 0;

            const list: Suggestion[] = [];
            if (lowRead.length) list.push({ key: "read", title: "Improve readability", desc: `${lowRead.length} page${s(lowRead.length)} read below ${READABILITY_FLOOR}/100`, icon: PATHS.book, color: "#F59E0B", href: "/content/quality?issue=readability", pages: lowRead });
            if (grammar.length) list.push({ key: "grammar", title: "Fix grammar & spelling", desc: `${grammar.length} page${s(grammar.length)} with issues`, icon: PATHS.edit, color: "#E91E63", href: "/content/quality?issue=grammar", pages: grammar });
            if (dupes.length) list.push({ key: "dupes", title: "Resolve duplicate passages", desc: `${dupes.length} page${s(dupes.length)} overlap other pages`, icon: PATHS.copy, color: "#6C5CE7", href: "/content/quality?issue=duplicates", pages: dupes });
            if (opps) list.push({ key: "links", title: "Add internal links", desc: `${opps} opportunit${opps === 1 ? "y" : "ies"} found`, icon: PATHS.link, color: "#00B894", href: "/seo/internal-links", pages: [] });

            setSuggestions(list);
            setCounts({ readability: lowRead.length, grammar: grammar.length, duplicates: dupes.length, links: opps });
            setTitles(scanned.slice(0, 20).map((e) => e.title));
            setScanning(false);
        })();
        return () => {
            off = true;
        };
    }, []);

    const runAiScan = async () => {
        setAiBusy(true);
        setAiError("");
        setAiTips(null);
        try {
            const prompt =
                `You are auditing a website's content for quality and SEO improvements.\n` +
                `Sample pages: ${titles.join(", ") || "n/a"}.\n` +
                `A deterministic scan found: ${counts.readability} hard-to-read page(s), ${counts.grammar} page(s) with grammar/spelling issues, ${counts.duplicates} page(s) with duplicated passages, and ${counts.links} internal-link opportunity(ies).\n` +
                `Give the 4 highest-impact, specific improvement suggestions for this site. One short line each. No numbering, no preamble.`;
            const res = await runAi({ feature: "content.suggestions", prompt, provider: providerId, model, maxTokens: 320 });
            const tips = res.text
                .split("\n")
                .map((l) => l.replace(/^[\s\-•*\d.]+/, "").trim())
                .filter(Boolean)
                .slice(0, 5);
            setAiTips(tips);
        } catch (e) {
            setAiError(aiErrorMessage(e));
        } finally {
            setAiBusy(false);
        }
    };

    return (
        <Card className="flex flex-col !p-6 xl:min-h-[28.5rem]">
            <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-h5 text-black dark:text-white">Quick suggestions</h2>
                <div className="inline-flex shrink-0 rounded-xl border border-grey-light p-0.5 dark:border-grey-light/15" role="tablist" aria-label="Suggestion mode">
                    {(["auto", "ai"] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            role="tab"
                            aria-selected={mode === m}
                            onClick={() => setMode(m)}
                            className={cn("rounded-lg px-2.5 py-1 text-caption-2 font-semibold transition-colors", mode === m ? "bg-primary text-white shadow-glow" : "text-grey hover:text-primary")}
                        >
                            {m === "auto" ? "Auto" : "AI"}
                        </button>
                    ))}
                </div>
            </div>

            {mode === "auto" ? (
                <div className="flex grow flex-col gap-2 overflow-y-auto">
                    {scanning ? (
                        <div className="flex grow flex-col items-center justify-center gap-3 py-8 text-center">
                            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
                            <p className="text-caption-1 text-grey">Scanning your site&hellip;</p>
                        </div>
                    ) : suggestions.length === 0 ? (
                        <div className="flex grow flex-col items-center justify-center gap-2 py-8 text-center">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-success/10">
                                <Stroke d={PATHS.check} color="#00B894" className="h-5 w-5" />
                            </span>
                            <p className="text-body-sm font-semibold text-black dark:text-white">All clear</p>
                            <p className="text-caption-2 text-grey">No issues detected in your latest content.</p>
                        </div>
                    ) : (
                        suggestions.map((item) => {
                            const expandable = item.pages.length > 0;
                            const isOpen = openKey === item.key;
                            return (
                                <div key={item.key} className="rounded-2xl border border-grey-light/70 dark:border-grey-light/10">
                                    {expandable ? (
                                        <button type="button" onClick={() => setOpenKey(isOpen ? null : item.key)} className="group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-lavender-mist/50 dark:hover:bg-dark-3/50">
                                            <Head item={item} />
                                            <Stroke d={PATHS.chevron} className={cn("h-4 w-4 shrink-0 text-grey transition-transform", isOpen && "rotate-90")} />
                                        </button>
                                    ) : (
                                        <Link href={item.href} className="group flex w-full items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-lavender-mist/50 dark:hover:bg-dark-3/50">
                                            <Head item={item} />
                                            <Stroke d={PATHS.chevron} className="h-4 w-4 shrink-0 text-grey transition-transform group-hover:translate-x-0.5" />
                                        </Link>
                                    )}
                                    {expandable && isOpen && (
                                        <ul className="border-t border-grey-light/70 px-3 py-2 dark:border-grey-light/10">
                                            {item.pages.slice(0, 6).map((p) => (
                                                <li key={p.id}>
                                                    <Link href={`/content/editor?id=${p.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-caption-1 text-black transition-colors hover:bg-lavender-mist/60 hover:text-primary dark:text-dark-text dark:hover:bg-dark-3/50">
                                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                                                        <span className="min-w-0 flex-1 truncate">{p.title}</span>
                                                        <Stroke d={PATHS.chevron} className="h-3 w-3 shrink-0 text-grey" />
                                                    </Link>
                                                </li>
                                            ))}
                                            {item.pages.length > 6 && <li className="px-2 pt-1 text-caption-2 text-grey">+{item.pages.length - 6} more</li>}
                                            <li>
                                                <Link href={item.href} className="block px-2 pt-1.5 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70">
                                                    Open the tool to fix &rarr;
                                                </Link>
                                            </li>
                                        </ul>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            ) : (
                <div className="flex grow flex-col gap-3">
                    {aiLoading ? (
                        <div className="flex grow items-center justify-center">
                            <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-lavender-mist border-t-primary" />
                        </div>
                    ) : !hasProvider ? (
                        <ConnectNotice tool="quick suggestions" />
                    ) : (
                        <>
                            <p className="text-caption-1 text-grey">A deeper, semantic review using your connected AI provider. Uses credits.</p>
                            <button type="button" onClick={runAiScan} disabled={aiBusy} className="btn-secondary btn-md self-start">
                                <Stroke d={PATHS.sparkle} className="h-4 w-4" />
                                {aiBusy ? "Scanning…" : aiTips ? "Re-scan with AI" : "Scan with AI"}
                            </button>
                            {aiError && <p className="text-caption-2 text-error">{aiError}</p>}
                            {aiTips && (
                                <ul className="flex flex-col gap-2">
                                    {aiTips.map((t, i) => (
                                        <li key={i} className="flex items-start gap-2.5 rounded-2xl border border-grey-light/70 p-3 text-body-sm text-black dark:border-grey-light/10 dark:text-dark-text">
                                            <Stroke d={PATHS.sparkle} color="#6C5CE7" className="mt-0.5 h-4 w-4 shrink-0" />
                                            <span className="min-w-0">{t}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            )}
        </Card>
    );
};

export default QuickSuggestionsCard;
