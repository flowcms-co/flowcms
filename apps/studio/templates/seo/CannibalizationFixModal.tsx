"use client";

import { Fragment, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";

/** A competing page within a cannibalization conflict. */
export type CannPage = { id: string | null; url: string | null; title: string | null; detail?: string; group?: string };
/** The cannibalization issue group handed to the modal. */
export type CannGroup = { title: string; explanation: string; fixHint: string; pages: CannPage[] };

type Conflict = { keyword: string; primary: CannPage; competitors: CannPage[] };

/** Strip the "Suggested primary · " prefix so we can show the shared recommendation once. */
const recommendationOf = (p: CannPage): string => (p.detail ?? "").replace(/^Suggested primary\s*·\s*/, "").trim();

/**
 * In-place keyword-cannibalization fix. For each conflict it spells out WHICH pages
 * compete, WHY it hurts ranking, and the RECOMMENDED action, then offers two paths:
 * a deterministic Manual Fix (point the competing pages' canonical at the strongest
 * page so Google consolidates the signals) and an optional AI consolidation plan.
 */
const CannibalizationFixModal = ({ group, onClose, onApplied }: { group: CannGroup | null; onClose: () => void; onApplied?: () => void }) => {
    const [busy, setBusy] = useState<string | null>(null);
    const [done, setDone] = useState<Set<string>>(new Set());
    const [aiBusy, setAiBusy] = useState<string | null>(null);
    const [aiPlan, setAiPlan] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

    // Fold the flat page list back into one conflict per keyword (group field).
    const conflicts = useMemo<Conflict[]>(() => {
        if (!group) return [];
        const byKw = new Map<string, CannPage[]>();
        for (const p of group.pages) {
            const k = p.group ?? "—";
            byKw.set(k, [...(byKw.get(k) ?? []), p]);
        }
        return [...byKw.entries()].map(([keyword, pages]) => ({ keyword, primary: pages[0], competitors: pages.slice(1) }));
    }, [group]);

    const applyCanonical = async (c: Conflict) => {
        const target = c.primary.url || c.primary.id;
        if (!target) return;
        setBusy(c.keyword);
        setError(null);
        try {
            // Point every competing managed page's canonical at the strongest page.
            for (const comp of c.competitors) {
                if (!comp.id) continue;
                await api(`/entries/${comp.id}`, { method: "PATCH", body: JSON.stringify({ data: { canonical: c.primary.url || "" } }) });
            }
            setDone((s) => new Set(s).add(c.keyword));
            onApplied?.();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't update the canonical tags.");
        } finally {
            setBusy(null);
        }
    };

    const runAi = async (c: Conflict) => {
        setAiBusy(c.keyword);
        setError(null);
        try {
            const pageList = [c.primary, ...c.competitors].map((p, i) => `${i === 0 ? "[strongest] " : ""}${p.title ?? p.url ?? "Untitled"}${p.url ? ` (${p.url})` : ""}`).join("\n");
            const r = await api<{ text: string }>("/ai/generate", {
                method: "POST",
                body: JSON.stringify({
                    feature: "seo.cannibalization",
                    system: "You are an SEO strategist. Give a short, concrete consolidation plan in plain language. No markdown fences.",
                    prompt: `These pages all compete for the keyword "${c.keyword}", splitting Google's ranking signals:\n${pageList}\n\nRecommend the single best action (merge, 301 redirect, canonical to the strongest, or re-target each to a distinct keyword). Name which page stays primary and what to do with each other page. Keep it under 120 words.`,
                    maxTokens: 320,
                    temperature: 0.4,
                }),
            });
            if (r.text) setAiPlan((p) => ({ ...p, [c.keyword]: r.text.trim() }));
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "AI plan failed. Connect an AI provider in Settings, Integrations.");
        } finally {
            setAiBusy(null);
        }
    };

    return (
        <Transition appear show={!!group} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <Icon className="h-5 w-5 fill-primary" name="copy" />
                                    <Dialog.Title className="text-h5 text-black dark:text-white">Resolve keyword cannibalization</Dialog.Title>
                                </div>
                                <p className="mb-4 text-caption-2 text-grey">
                                    When several pages target the same keyword, Google splits ranking signals between them and may surface the weaker one. Pick the strongest page as the primary, then consolidate the rest.
                                </p>

                                <div className="flex max-h-[28rem] flex-col gap-4 overflow-auto pr-1 scrollbar-thin">
                                    {conflicts.map((c) => {
                                        const applied = done.has(c.keyword);
                                        const canCanonical = c.competitors.some((p) => p.id);
                                        return (
                                            <div key={c.keyword} className="rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                                                <div className="mb-2 flex items-center gap-2">
                                                    <span className="text-caption-2 text-grey">Competing for</span>
                                                    <span className="rounded bg-lavender-mist px-1.5 py-0.5 text-caption-1 font-semibold text-primary dark:bg-dark-3 dark:text-lilac">{c.keyword}</span>
                                                </div>

                                                {/* Which pages compete */}
                                                <ul className="mb-3 flex flex-col gap-1.5">
                                                    {[c.primary, ...c.competitors].map((p, i) => (
                                                        <li key={`${p.id ?? p.url ?? i}`} className="flex items-center gap-2">
                                                            <Icon className={`h-4 w-4 shrink-0 ${i === 0 ? "fill-success" : "fill-grey/60"}`} name={i === 0 ? "check" : "document"} />
                                                            <span className="min-w-0 truncate text-caption-1 text-black dark:text-white">{p.title ?? p.url ?? "Untitled"}</span>
                                                            {i === 0 && <span className="shrink-0 rounded bg-success/12 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-[#0a7a5f] dark:text-success">Keep as primary</span>}
                                                        </li>
                                                    ))}
                                                </ul>

                                                {/* Why + recommended action */}
                                                <p className="mb-3 rounded-xl bg-lavender-mist/50 p-3 text-caption-2 text-grey dark:bg-dark-3/40">{recommendationOf(c.primary) || group?.fixHint}</p>

                                                {aiPlan[c.keyword] && (
                                                    <div className="mb-3 rounded-xl bg-primary/5 p-3 text-caption-1 text-black dark:text-white">
                                                        <div className="mb-1 flex items-center gap-1.5 text-caption-2 font-semibold text-primary"><Icon className="h-3.5 w-3.5 fill-primary" name="sparkles" /> AI consolidation plan</div>
                                                        <p className="whitespace-pre-wrap text-caption-1 text-grey">{aiPlan[c.keyword]}</p>
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap items-center gap-2">
                                                    {applied ? (
                                                        <span className="inline-flex items-center gap-1 text-caption-1 font-semibold text-success">
                                                            <Icon className="h-4 w-4 fill-success" name="check" /> Canonical pointed to the primary
                                                        </span>
                                                    ) : (
                                                        <button type="button" onClick={() => applyCanonical(c)} disabled={!canCanonical || busy === c.keyword} className="btn-secondary btn-sm disabled:opacity-50" title={canCanonical ? undefined : "These pages aren't managed in Flow CMS, so apply the fix on your site."}>
                                                            {busy === c.keyword ? "Applying…" : "Manual fix: canonical to primary"}
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => runAi(c)} disabled={aiBusy === c.keyword} className="btn-ghost btn-sm gap-1.5 text-primary disabled:opacity-60">
                                                        <Icon className="h-4 w-4 fill-primary" name="sparkles" />
                                                        {aiBusy === c.keyword ? "Thinking…" : "Fix with AI"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {error && <div className="mt-3 rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

                                <div className="mt-6 flex items-center justify-end gap-2">
                                    <button type="button" onClick={onClose} className="btn-primary h-9 px-4 text-caption-1">Done</button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default CannibalizationFixModal;
