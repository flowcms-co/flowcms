"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import ScoreRing from "@/components/ui/ScoreRing";
import CountUp from "@/components/motion/CountUp";
import ConnectNotice from "@/components/ai/ConnectNotice";
import { type GrammarIssue } from "@/mocks/ai";
import { checkGrammar, type GrammarIssueType, type TextIssue } from "@/lib/textTools";
import { aiErrorMessage, extractJson, runAi, useAiProviders } from "@/lib/useAi";

const typeColor: Record<GrammarIssueType, string> = {
    Spelling: "#E24B4A",
    Grammar: "#F5A623",
    Style: "#6C5CE7",
    Clarity: "#3B82F6",
};

const SYSTEM =
    "You are a meticulous copy editor. Review the user's text for spelling, grammar, style and clarity. " +
    "Respond with ONLY valid JSON (no prose, no code fences): " +
    `{"score": number (0-100 readability), "issues": [{"type": "Spelling"|"Grammar"|"Style"|"Clarity", "text": string (the exact problematic excerpt), "suggestion": string (the fix)}]}. ` +
    "Return an empty issues array if the writing is clean.";

type Review = { score: number; issues: GrammarIssue[] };
const VALID = new Set(["Spelling", "Grammar", "Style", "Clarity"]);

/**
 * Grammar & style checker. The default "Check writing" runs a free, offline
 * rule-based engine (spelling, grammar, wordiness, clichés, readability) — no AI
 * cost. "Check with AI" runs a deeper, context-aware pass via the provider.
 */
const Grammar = () => {
    const { hasProvider, loading, providerId, model } = useAiProviders();
    const [text, setText] = useState("");
    const [score, setScore] = useState(0);
    const [issues, setIssues] = useState<TextIssue[]>([]);
    const [engine, setEngine] = useState<"none" | "standard" | "ai">("none");
    const [busy, setBusy] = useState<null | "standard" | "ai">(null);
    const [error, setError] = useState<string | null>(null);
    const [resolved, setResolved] = useState<Set<string>>(new Set());

    const resolve = (id: string) => setResolved((p) => new Set(p).add(id));
    const open = issues.filter((i) => !resolved.has(i.id));

    const runStandard = () => {
        if (!text.trim()) return;
        const { score: s, issues: found } = checkGrammar(text);
        setScore(s);
        setIssues(found);
        setResolved(new Set());
        setEngine("standard");
        setError(null);
    };

    const runAiCheck = async () => {
        if (!text.trim() || busy || !hasProvider) return;
        setBusy("ai");
        setError(null);
        try {
            const res = await runAi({ feature: "ai.grammar", system: SYSTEM, prompt: text.trim(), provider: providerId || undefined, model: model || undefined, maxTokens: 1500 });
            const parsed = extractJson<Review>(res.text);
            if (!parsed || !Array.isArray(parsed.issues)) throw new Error("The model didn't return usable suggestions. Try again.");
            const clean = parsed.issues
                .filter((i) => i && i.text && i.suggestion && VALID.has(i.type))
                .map((i, idx) => ({ id: `a${idx}`, type: i.type as GrammarIssueType, text: i.text, suggestion: i.suggestion }));
            setIssues(clean);
            setScore(typeof parsed.score === "number" ? Math.round(parsed.score) : 80);
            setResolved(new Set());
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
                <label className="text-caption-1 text-grey mb-1.5">Paste the content to check</label>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    placeholder="Paste a paragraph or article here…"
                    className="flow-input resize-none mb-4"
                />
                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={runStandard} disabled={!text.trim()} className="btn-primary disabled:opacity-60">
                        <Icon className="w-5 h-5 fill-white" name="check" />
                        Check writing
                    </button>
                    <button type="button" onClick={runAiCheck} disabled={!!busy || !hasProvider || !text.trim()} className="btn-secondary disabled:opacity-60" title={hasProvider ? "Deeper, context-aware review" : "Connect a provider to use AI"}>
                        <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="sparkles" />
                        {busy === "ai" ? "Checking…" : "Check with AI"}
                    </button>
                    <span className="text-caption-2 text-grey">Standard check is free &amp; offline. AI adds nuance (and uses credits).</span>
                </div>
                {!loading && !hasProvider && <div className="mt-4"><ConnectNotice tool="the AI grammar pass" /></div>}
                {error && <div className="mt-4 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}
            </Card>

            {engine !== "none" && (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_7fr]">
                    <Card className="flex flex-col items-center">
                        <div className="flex w-full items-center justify-between mb-2">
                            <h2 className="text-h5 text-black dark:text-white">Readability</h2>
                            <EngineBadge engine={engine} />
                        </div>
                        <ScoreRing value={score} label="Score" size={150} />
                        <div className="mt-3 flex w-full justify-around text-center">
                            <div>
                                <CountUp value={open.length} className="font-poppins text-h5 font-bold text-error" />
                                <div className="text-caption-2 text-grey">Open</div>
                            </div>
                            <div>
                                <CountUp value={resolved.size} className="font-poppins text-h5 font-bold text-success" />
                                <div className="text-caption-2 text-grey">Resolved</div>
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <h2 className="text-h5 text-black dark:text-white mb-4">Suggestions</h2>
                        {open.length === 0 ? (
                            <div className="py-12 text-center text-body text-grey">All clear: nice writing! ✨</div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {open.map((i) => (
                                    <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-grey-light p-3 dark:border-grey-light/10">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[0.6875rem] font-semibold shrink-0" style={{ backgroundColor: `${typeColor[i.type]}1a`, color: typeColor[i.type] }}>{i.type}</span>
                                        <span className="min-w-0 grow text-body-sm">
                                            <span className="text-error line-through">{i.text}</span>
                                            <Icon className="inline w-3.5 h-3.5 fill-grey mx-1.5" name="arrow-right" />
                                            <span className="font-semibold text-success">{i.suggestion}</span>
                                        </span>
                                        <div className="flex gap-2 shrink-0">
                                            <button type="button" onClick={() => resolve(i.id)} className="btn-primary h-8 px-3 text-caption-2">Accept</button>
                                            <button type="button" onClick={() => resolve(i.id)} className="btn-secondary h-8 px-3 text-caption-2">Ignore</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
};

export const EngineBadge = ({ engine }: { engine: "standard" | "ai" }) =>
    engine === "ai" ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-primary/10 text-primary text-[0.6875rem] font-semibold">
            <Icon className="w-3 h-3 fill-primary" name="sparkles" />
            AI
        </span>
    ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-grey-light/60 text-grey text-[0.6875rem] font-semibold dark:bg-dark-3">
            Standard
        </span>
    );

export default Grammar;
