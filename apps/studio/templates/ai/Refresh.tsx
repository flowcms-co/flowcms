"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import ConnectLock from "@/components/ui/ConnectLock";
import { useConnections } from "@/lib/useConnections";
import { api } from "@/lib/api";
import { aiErrorMessage, runAi, useAiProviders } from "@/lib/useAi";

type Entry = { id: string; title: string; slug: string; updatedAt: string; publishedAt: string | null; data: Record<string, unknown>; contentType: { name: string } };
type Page = Entry & { ageDays: number; stale: boolean };

const STALE_DAYS = 90;
const ageLabel = (days: number) => {
    if (days < 1) return "today";
    if (days < 30) return `${days}d ago`;
    const m = Math.round(days / 30);
    if (m < 12) return `${m} month${m === 1 ? "" : "s"} ago`;
    const y = Math.round(days / 365);
    return `${y} year${y === 1 ? "" : "s"} ago`;
};

/**
 * Refresh Queue — surfaces published pages by how stale they are (real
 * updatedAt), flags those past the freshness window, and generates an
 * AI-refreshed draft on demand. Honest: staleness is by last-edit age (a true
 * traffic-decay signal needs GSC history per page).
 */
const Refresh = () => {
    const { connections: conn, loading: connLoading } = useConnections();
    const { hasProvider, providerId, model } = useAiProviders();
    const [pages, setPages] = useState<Page[] | null>(null);
    const [results, setResults] = useState<Record<string, string>>({});
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<Entry[]>("/entries?status=PUBLISHED")
            .then((rows) => {
                const now = Date.now();
                const mapped: Page[] = rows
                    .map((e) => {
                        const ref = e.publishedAt ?? e.updatedAt;
                        const ageDays = Math.floor((now - +new Date(ref)) / 86_400_000);
                        return { ...e, ageDays, stale: ageDays >= STALE_DAYS };
                    })
                    .sort((a, b) => b.ageDays - a.ageDays);
                setPages(mapped);
            })
            .catch(() => setPages([]));
    }, []);

    const staleCount = (pages ?? []).filter((p) => p.stale).length;

    const refresh = async (p: Page) => {
        if (busyId || !hasProvider) return;
        setBusyId(p.id);
        setError(null);
        try {
            const body = String((p.data as { body?: string })?.body ?? "").replace(/<[^>]+>/g, " ").trim() || p.title;
            const res = await runAi({
                feature: "ai.refresh",
                system: "You are a senior content editor. Refresh the given page so it reads as current, accurate and engaging while preserving its intent and key points. Return the refreshed content as clean markdown: no preamble.",
                prompt: `Title: ${p.title}\n\nCurrent content:\n${body}`,
                provider: providerId || undefined,
                model: model || undefined,
                maxTokens: 2000,
            });
            setResults((r) => ({ ...r, [p.id]: res.text.trim() }));
        } catch (e) {
            setError(aiErrorMessage(e));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <ConnectLock
            connected={conn.ai}
            loading={connLoading}
            icon="sparkles"
            title="Connect an AI provider"
            description="Connect a BYO AI provider key (OpenAI, Claude, and more) to use this tool."
            href="/settings/integrations?tab=ai"
            ctaLabel="Connect AI provider"
        >
        <div className="flex flex-col gap-6">
            <Card className="flex items-center gap-4 !p-5">
                <span className={`flex items-center justify-center w-12 h-12 rounded-2xl shrink-0 ${staleCount ? "bg-warning/10" : "bg-success/10"}`}>
                    <Icon className={`w-6 h-6 ${staleCount ? "fill-warning" : "fill-success"}`} name={staleCount ? "clock" : "check"} />
                </span>
                <div>
                    <h2 className="text-h5 text-black dark:text-white">
                        {pages === null ? "Checking your content…" : staleCount ? `${staleCount} page${staleCount === 1 ? "" : "s"} may need a refresh` : "Your published pages are fresh"}
                    </h2>
                    <p className="text-caption-2 text-grey">Pages older than {STALE_DAYS} days are flagged stale. Refresh updates the copy with AI.</p>
                </div>
            </Card>

            {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

            {pages !== null && pages.length === 0 && (
                <Card className="py-12 text-center text-body text-grey">No published content yet.</Card>
            )}

            <div className="flex flex-col gap-3">
                {(pages ?? []).map((p) => (
                    <Card key={p.id} className="flex flex-col gap-4 !p-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <span className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-xl py-2 ${p.stale ? "bg-warning/10" : "bg-lavender-mist dark:bg-dark-3"}`}>
                                <span className={`inline-flex items-center gap-0.5 text-title font-bold ${p.stale ? "text-warning" : "text-primary"}`}>
                                    <Icon className={`w-3.5 h-3.5 ${p.stale ? "fill-warning" : "fill-primary"}`} name="clock" />
                                    {p.ageDays}d
                                </span>
                                <span className="text-[0.625rem] text-grey">old</span>
                            </span>
                            <div className="min-w-0 grow">
                                <div className="truncate text-title text-black dark:text-white">{p.title}</div>
                                <div className="mt-0.5 text-caption-2 text-grey">/{p.slug} · {p.contentType?.name} · updated {ageLabel(p.ageDays)}</div>
                                <div className={`mt-1 text-caption-2 ${p.stale ? "text-warning" : "text-grey"}`}>{p.stale ? "Stale: consider refreshing to recover rankings" : "Within the freshness window"}</div>
                            </div>
                            <button type="button" onClick={() => refresh(p)} disabled={!!busyId || !hasProvider} className="btn-primary h-9 px-4 text-caption-1 shrink-0 disabled:opacity-60">
                                <Icon className="w-4 h-4 fill-white" name="sparkles" />
                                {busyId === p.id ? "Refreshing…" : "Refresh with AI"}
                            </button>
                        </div>

                        {results[p.id] && (
                            <div className="rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="inline-flex items-center gap-1 text-caption-1 font-semibold text-primary">
                                        <Icon className="w-4 h-4 fill-primary" name="sparkles" />
                                        AI-refreshed draft
                                    </span>
                                    <button type="button" onClick={() => navigator.clipboard.writeText(results[p.id])} className="btn-secondary h-8 px-3 text-caption-2">Copy</button>
                                </div>
                                <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-body-sm leading-relaxed text-black dark:text-white">{results[p.id]}</div>
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        </div>
        </ConnectLock>
    );
};

export default Refresh;
