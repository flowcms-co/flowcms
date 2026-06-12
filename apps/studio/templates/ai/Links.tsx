"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import CountUp from "@/components/motion/CountUp";
import ConnectNotice from "@/components/ai/ConnectNotice";
import { EngineBadge } from "@/templates/ai/Grammar";
import { api } from "@/lib/api";
import { suggestLinks, type LinkPage, type LinkSuggestion } from "@/lib/textTools";
import { aiErrorMessage, extractJson, runAi, useAiProviders } from "@/lib/useAi";

type Entry = { id: string; title: string; slug: string };

const SYSTEM =
    "You suggest internal links for a CMS. You are given the draft text and a list of the site's existing pages (title + path). " +
    "Suggest the most relevant internal links to add to the draft. Only use targets from the provided page list: never invent paths. " +
    "Respond with ONLY valid JSON (no prose, no code fences): " +
    `{"links": [{"anchor": string (phrase in the draft to link), "target": string (a path from the list), "relevance": number (0-100)}]}.`;

/**
 * Internal Link Suggestions. The default "Suggest links" runs offline: it
 * phrase-matches your real pages against the draft (the classic pre-AI approach)
 * — free and deterministic. "Suggest with AI" adds semantic suggestions. Both
 * only ever link to pages that actually exist.
 */
const Links = () => {
    const { hasProvider, loading, providerId, model } = useAiProviders();
    const [pages, setPages] = useState<Entry[]>([]);
    const [text, setText] = useState("");
    const [suggestions, setSuggestions] = useState<LinkSuggestion[] | null>(null);
    const [engine, setEngine] = useState<"standard" | "ai">("standard");
    const [busy, setBusy] = useState<null | "ai">(null);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<Record<string, "inserted" | "dismissed">>({});

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<Entry[]>("/entries").then(setPages).catch(() => {});
    }, []);

    const validTargets = new Set(pages.map((p) => `/${p.slug}`));
    const open = (suggestions ?? []).filter((l) => !done[l.target + l.anchor]);

    const runStandard = () => {
        if (!text.trim()) return;
        const list: LinkPage[] = pages.map((p) => ({ title: p.title, slug: p.slug }));
        setSuggestions(suggestLinks(text, list));
        setEngine("standard");
        setDone({});
        setError(null);
    };

    const runAiCheck = async () => {
        if (!text.trim() || busy || !hasProvider) return;
        setBusy("ai");
        setError(null);
        try {
            const pageList = pages.map((p) => `- ${p.title} (/${p.slug})`).join("\n");
            const res = await runAi({ feature: "ai.links", system: SYSTEM, prompt: `Draft text:\n${text.trim()}\n\nAvailable pages:\n${pageList || "(none)"}`, provider: providerId || undefined, model: model || undefined, maxTokens: 900 });
            const parsed = extractJson<{ links: LinkSuggestion[] }>(res.text);
            if (!parsed || !Array.isArray(parsed.links)) throw new Error("The model didn't return usable suggestions. Try again.");
            setSuggestions(parsed.links.filter((l) => l && l.anchor && validTargets.has(l.target)));
            setEngine("ai");
            setDone({});
        } catch (e) {
            setError(aiErrorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Card className="flex flex-col">
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-caption-1 text-grey">Paste the draft to find internal links for</label>
                    <span className="text-caption-2 text-grey"><CountUp value={pages.length} />&nbsp;pages indexed</span>
                </div>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste your draft content here…" className="flow-input resize-none mb-4" />
                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={runStandard} disabled={!text.trim()} className="btn-primary disabled:opacity-60">
                        <Icon className="w-5 h-5 fill-white" name="compass" />
                        Suggest links
                    </button>
                    <button type="button" onClick={runAiCheck} disabled={!!busy || !hasProvider || !text.trim()} className="btn-secondary disabled:opacity-60" title={hasProvider ? "Semantic suggestions via AI" : "Connect a provider to use AI"}>
                        <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="sparkles" />
                        {busy === "ai" ? "Scanning…" : "Suggest with AI"}
                    </button>
                    <span className="text-caption-2 text-grey">Standard phrase-matching is free &amp; offline. AI finds semantic matches.</span>
                </div>
                {!loading && !hasProvider && <div className="mt-4"><ConnectNotice tool="AI link suggestions" /></div>}
                {error && <div className="mt-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
            </Card>

            {suggestions && (
                <Card>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <h2 className="text-h5 text-black dark:text-white">Suggested internal links</h2>
                            <EngineBadge engine={engine} />
                        </div>
                        <span className="text-caption-2 text-grey"><CountUp value={open.length} />&nbsp;suggestions</span>
                    </div>
                    {open.length === 0 ? (
                        <div className="py-12 text-center text-body text-grey">{suggestions.length === 0 ? "No relevant internal links found among your existing pages." : "All suggestions handled."}</div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {open.map((l, i) => {
                                const color = l.relevance >= 80 ? "#00B894" : l.relevance >= 65 ? "#6C5CE7" : "#F5A623";
                                const key = l.target + l.anchor;
                                return (
                                    <div key={`${key}-${i}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-grey-light p-3.5 dark:border-grey-light/10">
                                        <div className="min-w-0 grow">
                                            <div className="flex items-center gap-2 text-body-sm">
                                                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">{l.anchor}</span>
                                                <Icon className="w-4 h-4 fill-grey" name="arrow-right" />
                                                <span className="min-w-0 truncate text-grey">{l.target}</span>
                                            </div>
                                        </div>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[0.6875rem] font-bold shrink-0" style={{ backgroundColor: `${color}1a`, color }}><CountUp value={l.relevance} suffix="% match" /></span>
                                        <div className="flex gap-2 shrink-0">
                                            <button type="button" onClick={() => setDone((d) => ({ ...d, [key]: "inserted" }))} className="btn-primary h-8 px-3 text-caption-2">
                                                <Icon className="w-3.5 h-3.5 fill-white" name="plus" />
                                                Insert
                                            </button>
                                            <button type="button" onClick={() => setDone((d) => ({ ...d, [key]: "dismissed" }))} className="btn-secondary h-8 px-3 text-caption-2">Dismiss</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

export default Links;
