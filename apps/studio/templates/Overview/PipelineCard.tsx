"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import MetricBar from "@/components/ui/MetricBar";
import CountUp from "@/components/motion/CountUp";
import EmptyState from "@/components/ui/EmptyState";
import { useDashboardSummary } from "@/lib/useDashboard";

const STAGE_COLOR: Record<string, string> = { Draft: "#6C5CE7", "In review": "#F5A623", Approved: "#00B894", Scheduled: "#3B82F6" };

/**
 * Content pipeline card — live counts of entries by workflow stage (draft /
 * review / approved / scheduled) with a live-published badge. Shows an empty
 * state until the workspace has content.
 */
const PipelineCard = () => {
    const summary = useDashboardSummary();

    const p = summary?.pipeline;
    const stages = p
        ? [
              { stage: "Draft", count: p.draft },
              { stage: "In review", count: p.review },
              { stage: "Approved", count: p.approved },
              { stage: "Scheduled", count: p.scheduled },
          ]
        : [];
    const totalRaw = stages.reduce((s, x) => s + x.count, 0);
    const total = Math.max(1, totalRaw);
    const goal = stages.map((s) => ({ stage: s.stage, percent: Math.round((s.count / total) * 100), color: STAGE_COLOR[s.stage] }));

    // Loaded but nothing in any stage and nothing published yet.
    const isEmpty = p != null && totalRaw === 0 && p.published === 0;

    return (
        <Card className="flex flex-col h-full">
            <div className="flex items-center justify-between">
                <h2 className="text-h5 text-black dark:text-white">
                    Content pipeline
                </h2>
                {p != null && p.published > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-success/10 text-success text-caption-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        <CountUp value={p.published} />&nbsp;live
                    </span>
                )}
            </div>

            {isEmpty ? (
                <div className="flex grow flex-col justify-center py-6">
                    <EmptyState
                        variant="bare"
                        icon="document"
                        title="No content yet"
                        description="Your draft, review and scheduled counts will appear here."
                        action={{ label: "Create content", href: "/content" }}
                    />
                </div>
            ) : (
                <>
                    <div className="flex flex-col justify-center grow gap-7 mt-2">
                        {goal.map((p) => (
                            <div key={p.stage}>
                                <div className="flex items-center justify-between mb-2.5">
                                    <span className="text-body-sm font-medium text-grey">
                                        {p.stage}
                                    </span>
                                    <CountUp value={p.percent} suffix="%" className="text-body-sm font-semibold text-black dark:text-white" />
                                </div>
                                <MetricBar
                                    percent={p.percent}
                                    color={p.color}
                                    trackClassName="h-2 rounded-pill bg-grey-light/60 dark:bg-grey-light/10"
                                    barClassName="rounded-pill"
                                />
                            </div>
                        ))}
                    </div>

                    <Link
                        href="/content/queue"
                        className="btn-secondary w-full mt-7"
                    >
                        View publish queue
                    </Link>
                </>
            )}
        </Card>
    );
};

export default PipelineCard;
