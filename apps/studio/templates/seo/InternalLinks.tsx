"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { aiErrorMessage, extractJson, runAi, useAiProviders } from "@/lib/useAi";

type Opp = {
    sourceId: string;
    sourceTitle: string;
    targetId: string;
    targetTitle: string;
    targetUrl: string;
    anchor: string;
    snippet: string;
};
type ScanResult = { opportunities: Opp[]; pages: number };

const keyOf = (o: Opp) => `${o.sourceId}|${o.targetId}|${o.anchor.toLowerCase()}`;

const AI_SYSTEM =
    "You review internal-linking opportunities for a website. Each item links a phrase found on one page to another page about that topic. " +
    "Keep only the ones where the link is genuinely relevant and the anchor reads naturally; drop generic or forced matches. " +
    'Respond with ONLY JSON (no prose, no code fences): {"keep": number[]} listing the indexes (0-based) to keep, best first.';

/**
 * Internal links — scans the workspace's published entries and surfaces where one
 * page mentions another page's topic without linking to it. Deterministic
 * phrase-matching by default; "Refine with AI" re-ranks. "Add link" edits the
 * source entry's body (one click) through the normal versioned update path.
 */
const InternalLinks = () => {
    const { hasProvider } = useAiProviders();
    const [data, setData] = useState<ScanResult | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [applied, setApplied] = useState<Set<string>>(new Set());
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [applyingAll, setApplyingAll] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [refined, setRefined] = useState(false);
    const [error, setError] = useState("");

    const scan = async () => {
        setScanning(true);
        setError("");
        try {
            const d = await api<ScanResult>("/seo/internal-links");
            setData(d);
            setApplied(new Set());
            setRefined(false);
        } catch {
            setError("Couldn't scan your content. Please try again.");
        } finally {
            setScanning(false);
            setLoaded(true);
        }
    };
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void scan();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const opps = useMemo(() => data?.opportunities ?? [], [data]);

    const applyOne = async (o: Opp) => {
        const k = keyOf(o);
        if (applied.has(k)) return;
        setBusyKey(k);
        setError("");
        try {
            await api("/seo/internal-links/apply", {
                method: "POST",
                body: JSON.stringify({ sourceId: o.sourceId, targetId: o.targetId, anchor: o.anchor }),
            });
            setApplied((p) => new Set(p).add(k));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't add that link.");
        } finally {
            setBusyKey(null);
        }
    };

    const applyAll = async () => {
        setApplyingAll(true);
        for (const o of opps) {
            if (!applied.has(keyOf(o))) {
                // eslint-disable-next-line no-await-in-loop
                await applyOne(o);
            }
        }
        setApplyingAll(false);
    };

    const refineWithAi = async () => {
        if (!opps.length) return;
        setAiBusy(true);
        setError("");
        try {
            const list = opps
                .map((o, i) => `${i}. On "${o.sourceTitle}", link "${o.anchor}" to "${o.targetTitle}"`)
                .join("\n");
            const res = await runAi({ feature: "ai.links", system: AI_SYSTEM, prompt: list, maxTokens: 500 });
            const parsed = extractJson<{ keep: number[] }>(res.text);
            const order = parsed && Array.isArray(parsed.keep) ? parsed.keep.filter((i) => i >= 0 && i < opps.length) : [];
            const kept = order.map((i) => opps[i]);
            if (kept.length) {
                setData({ opportunities: kept, pages: data?.pages ?? 0 });
                setRefined(true);
            }
        } catch (e) {
            setError(aiErrorMessage(e));
        } finally {
            setAiBusy(false);
        }
    };

    // Group opportunities by their source page.
    const groups = useMemo(() => {
        const m = new Map<string, { title: string; items: Opp[] }>();
        for (const o of opps) {
            const g = m.get(o.sourceId) ?? { title: o.sourceTitle, items: [] };
            g.items.push(o);
            m.set(o.sourceId, g);
        }
        return [...m.values()];
    }, [opps]);

    const remaining = opps.filter((o) => !applied.has(keyOf(o))).length;

    return (
        <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <Icon className="h-6 w-6 fill-primary dark:fill-lilac" name="compass" />
                </span>
                <div className="grow">
                    <h2 className="text-h5 text-black dark:text-white">Internal links</h2>
                    <p className="text-caption-2 text-grey">
                        Linking opportunities across your published pages. &ldquo;Add link&rdquo; edits the page and saves a version.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {hasProvider && opps.length > 0 && (
                        <button type="button" onClick={() => void refineWithAi()} disabled={aiBusy} className="btn-secondary h-10 px-4 disabled:opacity-60">
                            <Icon className="h-4 w-4 fill-primary dark:fill-lilac" name="sparkles" />
                            {aiBusy ? "Refining…" : "Refine with AI"}
                        </button>
                    )}
                    <button type="button" onClick={() => void scan()} disabled={scanning} className="btn-secondary h-10 px-4 disabled:opacity-60">
                        {scanning ? "Scanning…" : "Rescan"}
                    </button>
                    {remaining > 0 && (
                        <button type="button" onClick={() => void applyAll()} disabled={applyingAll} className="btn-primary h-10 px-4 disabled:opacity-60">
                            {applyingAll ? "Adding…" : `Add all (${remaining})`}
                        </button>
                    )}
                </div>
            </Card>

            {error && (
                <Card className="!border !border-error/20 !p-4">
                    <p className="text-body-sm text-error">{error}</p>
                </Card>
            )}

            {!loaded || scanning ? (
                <Card className="!p-10 text-center text-grey">Scanning your published pages…</Card>
            ) : opps.length === 0 ? (
                <Card className="!p-10 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10">
                        <Icon className="h-6 w-6 fill-success" name="check" />
                    </span>
                    <h3 className="text-h6 text-black dark:text-white">No new linking opportunities</h3>
                    <p className="mx-auto mt-1 max-w-md text-caption-2 text-grey">
                        We scanned {data?.pages ?? 0} published page{(data?.pages ?? 0) === 1 ? "" : "s"} and found no
                        unlinked mentions between them. Publish more related content, then rescan.
                    </p>
                </Card>
            ) : (
                <>
                    {refined && <p className="text-caption-2 text-grey">Refined with AI — showing the most relevant matches first.</p>}
                    {groups.map((g) => (
                        <Card key={g.title} className="overflow-hidden !p-0">
                            <div className="flex items-center gap-2 border-b border-grey-light px-5 py-3.5 dark:border-grey-light/10">
                                <Icon className="h-4 w-4 fill-grey" name="document" />
                                <span className="truncate text-title text-black dark:text-white">{g.title}</span>
                                <span className="shrink-0 text-caption-2 text-grey">
                                    · {g.items.length} {g.items.length === 1 ? "opportunity" : "opportunities"}
                                </span>
                            </div>
                            <ul className="divide-y divide-grey-light dark:divide-grey-light/10">
                                {g.items.map((o) => {
                                    const k = keyOf(o);
                                    const done = applied.has(k);
                                    return (
                                        <li key={k} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                                            <div className="min-w-0 grow">
                                                <div className="flex flex-wrap items-center gap-1.5 text-body-sm">
                                                    <span className="text-grey">Link</span>
                                                    <span className="rounded-md bg-lavender-mist px-1.5 py-0.5 font-semibold text-purple-700 dark:bg-dark-3 dark:text-lilac">
                                                        {o.anchor}
                                                    </span>
                                                    <Icon className="h-3.5 w-3.5 fill-grey" name="arrow-right" />
                                                    <span className="truncate font-semibold text-black dark:text-white">{o.targetTitle}</span>
                                                    <span className="text-caption-2 text-grey">{o.targetUrl}</span>
                                                </div>
                                                <p className="mt-1 line-clamp-1 text-caption-2 text-grey">{o.snippet}</p>
                                            </div>
                                            {done ? (
                                                <span className="inline-flex shrink-0 items-center gap-1.5 text-caption-1 font-semibold text-[#0a7a5f] dark:text-success">
                                                    <Icon className="h-4 w-4 fill-[#0a7a5f] dark:fill-success" name="check" />
                                                    Linked
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => void applyOne(o)}
                                                    disabled={busyKey === k}
                                                    className="btn-secondary h-9 shrink-0 px-3.5 text-caption-1 disabled:opacity-60"
                                                >
                                                    {busyKey === k ? "Adding…" : "Add link"}
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </Card>
                    ))}
                </>
            )}
        </div>
    );
};

export default InternalLinks;
