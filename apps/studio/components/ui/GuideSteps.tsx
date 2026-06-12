"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import type { GuideStep } from "@/lib/integrationGuides";

/**
 * Interactive setup guide: a collapsible, numbered checklist of steps with
 * "Open" links. Each step can be ticked off (local, just to help the user track
 * progress). Gives connect flows a self-serve, follow-along feel.
 */
const GuideSteps = ({
    steps,
    title = "How to connect",
    reviewedAt,
    defaultOpen = false,
}: {
    steps: GuideStep[];
    title?: string;
    reviewedAt?: string;
    defaultOpen?: boolean;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const [done, setDone] = useState<number[]>([]);
    const toggle = (i: number) =>
        setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));

    return (
        <div className="rounded-2xl border border-grey-light dark:border-grey-light/10">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3"
            >
                <span className="flex items-center gap-2 text-title text-black dark:text-white">
                    <Icon className="w-4 h-4 fill-primary" name="compass" />
                    {title}
                    <span className="text-caption-2 font-normal text-grey">
                        · {done.length}/{steps.length}
                    </span>
                </span>
                <Icon
                    className={cn("w-4 h-4 fill-grey transition-transform", open && "rotate-180")}
                    name="arrow-down"
                />
            </button>

            {open && (
                <ol className="flex flex-col gap-1 px-3 pb-3">
                    {steps.map((s, i) => {
                        const checked = done.includes(i);
                        return (
                            <li key={i} className="flex gap-3 rounded-xl p-2 hover:bg-lavender-mist/50 dark:hover:bg-dark-3/40">
                                <button
                                    type="button"
                                    onClick={() => toggle(i)}
                                    aria-label={checked ? "Mark step incomplete" : "Mark step complete"}
                                    className={cn(
                                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.45rem] text-caption-2 font-bold transition-colors",
                                        checked
                                            ? "bg-success text-white"
                                            : "bg-lavender-mist text-primary dark:bg-dark-3",
                                    )}
                                >
                                    {checked ? <Icon className="w-3.5 h-3.5 fill-white" name="check" /> : i + 1}
                                </button>
                                <div className="min-w-0 grow">
                                    <div
                                        className={cn(
                                            "text-body-sm font-semibold text-black dark:text-white",
                                            checked && "line-through opacity-60",
                                        )}
                                    >
                                        {s.title}
                                    </div>
                                    <p className="text-caption-2 text-grey leading-snug">{s.body}</p>
                                    {s.link && (
                                        <a
                                            href={s.link.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-1 inline-flex items-center gap-1 text-caption-2 font-semibold text-primary hover:opacity-70"
                                        >
                                            {s.link.label}
                                            <Icon className="w-3.5 h-3.5 fill-primary" name="external" />
                                        </a>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                    {reviewedAt && (
                        <li className="px-2 pt-1 text-caption-2 text-grey">Steps verified {reviewedAt}.</li>
                    )}
                </ol>
            )}
        </div>
    );
};

export default GuideSteps;
