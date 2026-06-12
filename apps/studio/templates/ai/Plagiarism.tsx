"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import ScoreRing from "@/components/ui/ScoreRing";
import CountUp from "@/components/motion/CountUp";
import ConnectNotice from "@/components/ai/ConnectNotice";
import { EngineBadge } from "@/templates/ai/Grammar";
import { api } from "@/lib/api";
import { checkOriginality, type CorpusPage, type OriginalityNote } from "@/lib/textTools";
import { aiErrorMessage, extractJson, runAi, useAiProviders } from "@/lib/useAi";

const SYSTEM =
    "You are an originality reviewer. You CANNOT access the web, so do not invent source URLs. " +
    "Assess how original the writing is and flag passages that read as generic boilerplate, clichéd phrasing, or likely-unoriginal/AI-template text. " +
    "Respond with ONLY valid JSON (no prose, no code fences): " +
    `{"originality": number (0-100, higher = more original), "notes": [{"severity": "high"|"medium"|"low", "snippet": string (the flagged excerpt), "why": string (why it reads as unoriginal)}]}.`;

type Entry = { title: string; data: Record<string, unknown> };
type AiReview = { originality: number; notes: OriginalityNote[] };
const sevColor: Record<string, string> = { high: "#E24B4A", medium: "#F5A623", low: "#6A6A85" };

/**
 * Originality review. The default "Check originality" runs offline: it detects
 * passages duplicated from the workspace's own pages (self-plagiarism) plus
 * boilerplate — no AI cost. "Check with AI" adds a heuristic originality read.
 * Neither is a web-wide plagiarism scan (that needs a dedicated plagiarism API).
 */
const Plagiarism = () => {
    const { hasProvider, loading, providerId, model } = useAiProviders();
    const [text, setText] = useState("");
    const [corpus, setCorpus] = useState<CorpusPage[]>([]);
    const [score, setScore] = useState(0);
    const [notes, setNotes] = useState<OriginalityNote[]>([]);
    const [engine, setEngine] = useState<"none" | "standard" | "ai">("none");
    const [busy, setBusy] = useState<null | "ai">(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<Entry[]>("/entries")
            .then((rows) => setCorpus(rows.map((e) => ({ title: e.title, body: String((e.data as { body?: string })?.body ?? "") }))))
            .catch(() => {});
    }, []);

    const runStandard = () => {
        if (!text.trim()) return;
        const r = checkOriginality(text, corpus);
        setScore(r.score);
        setNotes(r.notes);
        setEngine("standard");
        setError(null);
    };

    const runAiCheck = async () => {
        if (!text.trim() || busy || !hasProvider) return;
        setBusy("ai");
        setError(null);
        try {
            const res = await runAi({ feature: "ai.plagiarism", system: SYSTEM, prompt: text.trim(), provider: providerId || undefined, model: model || undefined, maxTokens: 1200 });
            const parsed = extractJson<AiReview>(res.text);
            if (!parsed || typeof parsed.originality !== "number") throw new Error("The model didn't return a usable review. Try again.");
            setScore(Math.round(parsed.originality));
            setNotes(Array.isArray(parsed.notes) ? parsed.notes : []);
            setEngine("ai");
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
                    <label className="text-caption-1 text-grey">Paste the content to review</label>
                    <span className="text-caption-2 text-grey"><CountUp value={corpus.length} />&nbsp;of your pages indexed</span>
                </div>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste a paragraph or article here…" className="flow-input resize-none mb-4" />
                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={runStandard} disabled={!text.trim()} className="btn-primary disabled:opacity-60">
                        <Icon className="w-5 h-5 fill-white" name="check" />
                        Check originality
                    </button>
                    <button type="button" onClick={runAiCheck} disabled={!!busy || !hasProvider || !text.trim()} className="btn-secondary disabled:opacity-60" title={hasProvider ? "AI originality heuristic" : "Connect a provider to use AI"}>
                        <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="sparkles" />
                        {busy === "ai" ? "Reviewing…" : "Check with AI"}
                    </button>
                    <span className="text-caption-2 text-grey">Standard = duplicate check vs your own pages (free). Not a web-wide scan.</span>
                </div>
                {!loading && !hasProvider && <div className="mt-4"><ConnectNotice tool="the AI originality pass" /></div>}
                {error && <div className="mt-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
            </Card>

            {engine !== "none" && (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_7fr]">
                    <Card className="flex flex-col items-center">
                        <div className="flex w-full items-center justify-between mb-2">
                            <h2 className="text-h5 text-black dark:text-white">Originality</h2>
                            <EngineBadge engine={engine} />
                        </div>
                        <ScoreRing value={score} label="Original" size={150} />
                        <p className="mt-3 text-center text-caption-2 text-grey"><CountUp value={score} suffix="%" /> original · <CountUp value={notes.length} /> passage{notes.length === 1 ? "" : "s"} flagged</p>
                    </Card>

                    <Card>
                        <h2 className="text-h5 text-black dark:text-white mb-4">Flagged passages</h2>
                        {notes.length === 0 ? (
                            <div className="py-12 text-center text-body text-grey">No duplicated or generic passages flagged. ✨</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {notes.map((m, i) => {
                                    const color = sevColor[m.severity] ?? "#6A6A85";
                                    return (
                                        <div key={i} className="rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="min-w-0 grow text-body-sm italic text-black dark:text-white">&ldquo;{m.snippet}&rdquo;</span>
                                                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-pill text-[0.6875rem] font-bold capitalize" style={{ backgroundColor: `${color}1a`, color }}>{m.severity}</span>
                                            </div>
                                            <p className="mt-1.5 text-caption-2 text-grey">{m.why}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
};

export default Plagiarism;
