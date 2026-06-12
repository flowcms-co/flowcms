"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useScrollResetOnChange } from "@/lib/useScroll";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import MetricBar from "@/components/ui/MetricBar";
import ConnectLock from "@/components/ui/ConnectLock";
import { useConnections } from "@/lib/useConnections";
import AiBudgetCard from "./AiBudgetCard";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

type Bucket = { key: string; label: string; calls: number; tokens: number; costUsd: number };
type Summary = {
    rangeDays: number;
    totals: { calls: number; tokens: number; costUsd: number };
    byProvider: Bucket[];
    byFeature: Bucket[];
    byUser: Bucket[];
    daily: { date: string; calls: number; tokens: number }[];
};

const RANGES = [7, 30, 90];
const COLORS = ["#6C5CE7", "#3B82F6", "#00B894", "#F5A623", "#E91E63"];
const fmt = (n: number) => n.toLocaleString();

/** AI Tools → Usage: workspace-wide token + cost metering so the team stays in check. */
const Usage = () => {
    const { connections: conn, loading: connLoading } = useConnections();
    const [days, setDays] = useState(30);
    const topRef = useRef<HTMLDivElement>(null);
    useScrollResetOnChange(topRef, days);
    const [data, setData] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        try {
            setData(await api<Summary>(`/usage/summary?days=${d}`));
            setError(null);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not load usage.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load(days);
    }, [load, days]);

    const totals = data?.totals;
    const maxTokens = Math.max(1, ...(data?.byProvider ?? []).map((b) => b.tokens));
    const maxUserTokens = Math.max(1, ...(data?.byUser ?? []).map((b) => b.tokens));

    return (
        <div className="flex flex-col gap-6">
            <div ref={topRef} className="scroll-mt-6" />
            <div className="flex items-center justify-between gap-3">
                <p className="text-body-sm text-grey">AI token and cost usage across the workspace.</p>
                <div className="flex gap-1 rounded-2xl bg-lavender-mist/70 p-1 dark:bg-dark-2">
                    {RANGES.map((r) => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setDays(r)}
                            className={cn(
                                "h-8 px-3 rounded-xl text-caption-1 font-semibold transition-colors",
                                r === days ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey",
                            )}
                        >
                            {r}d
                        </button>
                    ))}
                </div>
            </div>

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
            {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

            {/* Totals */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                    { label: "AI calls", value: fmt(totals?.calls ?? 0), icon: "sparkles", color: "#6C5CE7" },
                    { label: "Tokens", value: fmt(totals?.tokens ?? 0), icon: "chart", color: "#3B82F6" },
                    {
                        label: "Estimated cost",
                        value: `$${(totals?.costUsd ?? 0).toFixed(2)}`,
                        icon: "wallet",
                        color: "#00B894",
                    },
                ].map((t) => (
                    <Card key={t.label} className="!p-5">
                        <span
                            className="flex items-center justify-center w-10 h-10 rounded-2xl mb-4"
                            style={{ backgroundColor: `${t.color}22` }}
                        >
                            <Icon className="w-5 h-5" name={t.icon} fill={t.color} />
                        </span>
                        <div className="font-poppins text-[1.75rem] leading-none font-extrabold text-black dark:text-white">
                            {loading ? "…" : t.value}
                        </div>
                        <div className="mt-1 text-caption-2 text-grey">{t.label}</div>
                    </Card>
                ))}
            </div>

            <AiBudgetCard />

            {/* Empty state */}
            {!loading && totals?.calls === 0 && (
                <Card className="text-center py-10">
                    <p className="text-body-sm text-grey">
                        No AI usage yet. Generations from the AI tools will show up here.
                    </p>
                </Card>
            )}

            {!loading && (totals?.calls ?? 0) > 0 && (
                <>
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        {/* By provider */}
                        <Card>
                            <h2 className="text-h5 text-black dark:text-white mb-4">By provider</h2>
                            <div className="flex flex-col gap-3.5">
                                {data!.byProvider.map((b, i) => (
                                    <div key={b.key}>
                                        <div className="flex items-center justify-between gap-3 mb-1.5">
                                            <span className="text-body-sm capitalize text-black dark:text-white">{b.label}</span>
                                            <span className="text-caption-1 font-semibold text-grey">{fmt(b.tokens)} tok</span>
                                        </div>
                                        <MetricBar
                                            percent={Math.round((b.tokens / maxTokens) * 100)}
                                            color={COLORS[i % COLORS.length]}
                                            trackClassName="h-2 rounded-pill bg-grey-light/70 dark:bg-grey-light/10"
                                            barClassName="rounded-pill"
                                        />
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* By feature */}
                        <Card>
                            <h2 className="text-h5 text-black dark:text-white mb-4">By feature</h2>
                            <div className="flex flex-col gap-2">
                                {data!.byFeature.map((b, i) => (
                                    <div key={b.key} className="flex items-center gap-3">
                                        <span
                                            className="w-2.5 h-2.5 rounded-[0.25rem] shrink-0"
                                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                        />
                                        <span className="grow text-body-sm text-black dark:text-white">{b.label}</span>
                                        <span className="text-caption-2 text-grey">{fmt(b.calls)} calls</span>
                                        <span className="w-24 text-right text-caption-1 font-semibold text-grey">
                                            {fmt(b.tokens)} tok
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* By user */}
                    <Card className="!p-0 overflow-hidden">
                        <h2 className="text-h5 text-black dark:text-white p-5 pb-3">By user</h2>
                        <div className="hidden md:grid grid-cols-[2fr_1fr_1.5fr_1fr] gap-4 px-5 py-3 border-y border-grey-light text-caption-2 text-grey dark:border-grey-light/10">
                            <span>User</span>
                            <span>Calls</span>
                            <span>Tokens</span>
                            <span className="text-right">Est. cost</span>
                        </div>
                        {data!.byUser.map((b, i) => (
                            <div
                                key={b.key}
                                className="grid grid-cols-[2fr_1fr] md:grid-cols-[2fr_1fr_1.5fr_1fr] items-center gap-4 px-5 py-3.5 border-b border-grey-light last:border-b-0 dark:border-grey-light/10"
                            >
                                <span className="truncate text-title text-black dark:text-white">{b.label}</span>
                                <span className="text-body-sm text-grey">{fmt(b.calls)}</span>
                                <span className="hidden md:flex items-center gap-2">
                                    <MetricBar
                                        percent={Math.round((b.tokens / maxUserTokens) * 100)}
                                        color={COLORS[i % COLORS.length]}
                                        trackClassName="h-1.5 w-24 rounded-pill bg-grey-light/70 dark:bg-grey-light/10"
                                        barClassName="rounded-pill"
                                    />
                                    <span className="text-caption-1 text-grey">{fmt(b.tokens)}</span>
                                </span>
                                <span className="hidden md:block text-right text-caption-1 font-semibold text-black dark:text-white">
                                    ${b.costUsd.toFixed(4)}
                                </span>
                            </div>
                        ))}
                    </Card>
                </>
            )}
            </div>
            </ConnectLock>
        </div>
    );
};

export default Usage;
