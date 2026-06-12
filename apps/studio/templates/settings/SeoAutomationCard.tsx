"use client";

import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { useSeoFixMode, type SeoFixMode } from "@/lib/seoPrefs";

const OPTIONS: { value: SeoFixMode; label: string; desc: string; icon: string }[] = [
    {
        value: "review",
        label: "Review before applying",
        desc: "AI suggests the fix; you review it and apply with one click. Safest: recommended.",
        icon: "check",
    },
    {
        value: "auto",
        label: "Auto-apply safe fixes",
        desc: "Apply confident fixes to Flow CMS-managed content automatically; external pages still copy for review.",
        icon: "sparkles",
    },
];

/**
 * SEO fix-mode lever. We never silently change a live external site — this only
 * controls how eagerly fixes are surfaced/applied for content Flow CMS manages.
 */
const SeoAutomationCard = () => {
    const [mode, setMode] = useSeoFixMode();

    return (
        <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                    <Icon className="h-5 w-5 fill-primary" name="sparkles" />
                </span>
                <div>
                    <h2 className="text-h5 text-black dark:text-white">SEO fixes</h2>
                    <p className="text-caption-2 text-grey">How the SEO suite applies AI-generated fixes (titles, descriptions, schema).</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {OPTIONS.map((o) => {
                    const active = mode === o.value;
                    return (
                        <button
                            key={o.value}
                            type="button"
                            onClick={() => setMode(o.value)}
                            className={cn(
                                "flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors",
                                active
                                    ? "border-primary bg-primary/5"
                                    : "border-grey-light hover:border-primary/40 dark:border-grey-light/10",
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-title text-black dark:text-white">
                                    <Icon className={cn("h-4 w-4", active ? "fill-primary" : "fill-grey")} name={o.icon} />
                                    {o.label}
                                </span>
                                <span
                                    className={cn(
                                        "flex h-5 w-5 items-center justify-center rounded-full border-2",
                                        active ? "border-primary bg-primary" : "border-grey-light dark:border-grey-light/30",
                                    )}
                                >
                                    {active && <Icon className="h-3 w-3 fill-white" name="check" />}
                                </span>
                            </div>
                            <p className="text-caption-2 text-grey">{o.desc}</p>
                        </button>
                    );
                })}
            </div>

            <p className="text-caption-2 text-grey">
                Flow CMS never pushes changes to a site it doesn&rsquo;t manage. For an externally-audited site (via Search
                Console), every fix is generated for you to copy: regardless of this setting.
            </p>
        </Card>
    );
};

export default SeoAutomationCard;
