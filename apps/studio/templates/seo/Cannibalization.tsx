"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import CountUp from "@/components/motion/CountUp";
import ConnectLock from "@/components/ui/ConnectLock";
import { api } from "@/lib/api";
import { useConnections } from "@/lib/useConnections";
import LiveBadge from "./LiveBadge";

type Group = {
    id: string;
    keyword: string;
    severity: "high" | "medium";
    pages: { path: string; position: number; clicks: number }[];
    recommendation: string;
};
type CannibalLive = { hasData: boolean; groups: Group[] };

/**
 * Cannibalization — queries where multiple of the site's pages compete, splitting
 * ranking signals. Live from GSC query×page data; empty otherwise.
 */
const Cannibalization = () => {
    const [live, setLive] = useState<CannibalLive | null>(null);
    const [loaded, setLoaded] = useState(false);
    const { connections: conn, loading: connLoading } = useConnections();

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<CannibalLive>("/seo/cannibalization")
            .then((d) => setLive(d.hasData ? d : null))
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    const isLive = !!live;
    const groups: Group[] = isLive ? live!.groups : [];

    return (
        <ConnectLock
            connected={conn.gsc}
            loading={connLoading}
            brand="Google Search Console"
            title="Connect Search Console"
            description="Connect Google Search Console to find queries where multiple pages compete and split your ranking signals."
            href="/settings/integrations?tab=analytics"
            ctaLabel="Connect Search Console"
        >
        <div className="flex flex-col gap-6">
            <Card className="flex items-center gap-4 !p-5">
                <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-error/10 shrink-0">
                    <Icon className="w-6 h-6 fill-error" name="search" />
                </span>
                <div className="grow">
                    <div className="flex items-center gap-2.5">
                        <h2 className="text-h5 text-black dark:text-white"><CountUp value={groups.length} />&nbsp;cannibalization conflicts</h2>
                        <LiveBadge live={isLive} source="Search Console" />
                    </div>
                    <p className="text-caption-2 text-grey">
                        Multiple URLs competing for the same query: consolidate to recover rankings.
                    </p>
                </div>
            </Card>

            {!isLive && loaded && (
                <Card className="!p-0 overflow-hidden">
                    <div className="px-5 py-12 text-center text-body text-grey">No data yet.</div>
                </Card>
            )}

            {isLive && groups.length === 0 && (
                <Card className="flex flex-col items-center gap-3 py-14 text-center">
                    <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-success/10">
                        <Icon className="w-6 h-6 fill-success" name="check" />
                    </span>
                    <h3 className="text-title text-black dark:text-white">No cannibalization detected</h3>
                    <p className="max-w-md text-caption-2 text-grey">
                        Every query in Search Console maps cleanly to a single page. Nothing to consolidate right now.
                    </p>
                </Card>
            )}

            {groups.map((g) => {
                const color = g.severity === "high" ? "#E24B4A" : "#F5A623";
                return (
                    <Card key={g.id} className="flex flex-col">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3">
                                <span
                                    className="flex items-center justify-center w-10 h-10 rounded-2xl shrink-0"
                                    style={{ backgroundColor: `${color}1f` }}
                                >
                                    <Icon className="w-5 h-5" name="search" fill={color} />
                                </span>
                                <div>
                                    <h3 className="text-title text-black dark:text-white">&ldquo;{g.keyword}&rdquo;</h3>
                                    <p className="text-caption-2 text-grey"><CountUp value={g.pages.length} />&nbsp;pages competing</p>
                                </div>
                            </div>
                            <span
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-caption-2 font-semibold capitalize"
                                style={{ backgroundColor: `${color}1f`, color }}
                            >
                                {g.severity}
                            </span>
                        </div>

                        <div className="flex flex-col gap-2">
                            {g.pages.map((p, i) => (
                                <div
                                    key={p.path}
                                    className="flex items-center gap-3 rounded-2xl border border-grey-light p-3 dark:border-grey-light/10"
                                >
                                    <span className="flex items-center justify-center w-6 h-6 rounded-[0.5rem] bg-lavender-mist text-caption-2 font-bold text-primary shrink-0 dark:bg-dark-3 dark:text-lilac">
                                        {i + 1}
                                    </span>
                                    <span className="min-w-0 grow truncate text-body-sm text-black dark:text-white">{p.path}</span>
                                    <span className="shrink-0 text-caption-2 text-grey"><CountUp value={p.clicks} />&nbsp;clicks</span>
                                    <CountUp value={p.position} decimals={1} prefix="#" className="shrink-0 w-14 text-right text-caption-1 font-semibold text-black dark:text-white" />
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-lavender-mist/60 p-4 dark:bg-dark-3/50">
                            <div className="flex items-start gap-2.5 min-w-0">
                                <Icon className="w-5 h-5 fill-primary shrink-0 mt-0.5" name="sparkles" />
                                <p className="text-body-sm text-black dark:text-white">
                                    <span className="font-semibold">Recommendation: </span>
                                    {g.recommendation}
                                </p>
                            </div>
                        </div>
                    </Card>
                );
            })}
        </div>
        </ConnectLock>
    );
};

export default Cannibalization;
