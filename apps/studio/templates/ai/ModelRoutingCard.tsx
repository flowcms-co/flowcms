"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { api } from "@/lib/api";

type Row = { task: string; model: string | null; provider: string | null; free: boolean; routed: "chooser" | "fallback" | "none" };
type Preview = { tier: number; plan: string; connectedProviders: string[]; tasks: Row[] };

const TASK_LABEL: Record<string, string> = {
    meta_title_description: "Meta title & description",
    image_alt_tag: "Image alt text",
    schema_audit: "Schema / structured data",
    core_web_vitals: "Core Web Vitals",
    onpage_seo_audit: "On-page SEO",
    content_generation: "Content generation",
    gsc_ga_analysis: "Search analytics",
    technical_diagnosis: "Technical diagnosis",
};
const PLAN_LABEL: Record<string, string> = { community: "Community", pro: "Pro", enterprise: "Enterprise" };

/**
 * AI → Usage: which model the unified cost-aware router would actually pick per task
 * on this plan + connected providers (the real chooser decision, or the connected
 * provider's fallback). Picking a model inside any tool always overrides it.
 */
const ModelRoutingCard = () => {
    const [data, setData] = useState<Preview | null>(null);

    useEffect(() => {
        void api<Preview>("/ai/route-preview").then(setData).catch(() => {});
    }, []);

    if (!data) return null;

    return (
        <Card className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                    <Icon name="sparkles" className="h-5 w-5 fill-primary dark:fill-lilac" />
                </span>
                <div className="grow">
                    <h2 className="text-h5 text-black dark:text-white">Model routing</h2>
                    <p className="text-caption-2 text-grey">
                        The model the cost-aware router picks for each task on your {PLAN_LABEL[data.plan] ?? data.plan} plan and connected
                        providers. Cheapest capable first; free tiers used before paid. Picking a model inside a tool always overrides this.
                    </p>
                </div>
            </div>

            {data.connectedProviders.length === 0 ? (
                <p className="text-caption-2 text-grey">Connect an AI provider in Settings &rarr; Integrations to see routing.</p>
            ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {data.tasks.map((t) => (
                        <div key={t.task} className="flex items-center justify-between gap-3 rounded-xl border border-grey-light px-3 py-2 dark:border-grey-light/10">
                            <span className="text-caption-1 text-black dark:text-white">{TASK_LABEL[t.task] ?? t.task}</span>
                            <span className="flex items-center gap-1.5 text-caption-2 text-grey">
                                {t.model ? (
                                    <>
                                        <code className="rounded bg-lavender-mist px-1 text-purple-700 dark:bg-dark-3 dark:text-lilac">{t.model}</code>
                                        {t.free && <span className="rounded bg-success/15 px-1 text-[0.625rem] font-semibold text-success">FREE</span>}
                                    </>
                                ) : (
                                    <span>Connect a provider</span>
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

export default ModelRoutingCard;
