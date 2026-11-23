"use client";

import { useEffect, useRef } from "react";
import type { RuleIssue } from "@flowcms/shared/content-rules";
import { cn } from "@/lib/cn";

/**
 * The list of everything that stops an article going live, with a jump link for each.
 * Hard problems first ("Fix before publishing"), soft ones after ("Worth a look"). The text
 * of each row comes from the shared rules, so it reads the same as the API's answer.
 */
const FixPanel = ({ issues, onJump, onClose }: { issues: RuleIssue[]; onJump: (path: string) => void; onClose: () => void }) => {
    const ref = useRef<HTMLElement>(null);
    const hard = issues.filter((i) => i.level === "block");
    const soft = issues.filter((i) => i.level === "warn");

    // Opening the panel brings it into view, so a publish that was refused is never silent.
    useEffect(() => {
        ref.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }, []);

    const row = (i: RuleIssue, k: number, tone: "error" | "warning") => (
        <li key={`${i.path}-${i.rule}-${k}`}>
            <button
                type="button"
                onClick={() => onJump(i.path)}
                className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
            >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone === "error" ? "bg-error" : "bg-warning")} aria-hidden="true" />
                <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-caption-1 font-semibold text-dark-1 dark:text-white">{i.location}</span>
                    <span className="text-caption-1 text-dark-1/90 dark:text-white/90">{i.message}</span>
                    {i.fieldHelp && <span className="text-caption-2 text-grey/80">{i.fieldHelp}</span>}
                </span>
                <span className="ml-auto shrink-0 self-center pl-2 text-caption-2 font-medium text-primary opacity-70 group-hover:opacity-100 dark:text-lilac">Go to it</span>
            </button>
            {i.guide && (
                <a href={i.guide.url} target="_blank" rel="noopener noreferrer" className="ml-[1.375rem] inline-block px-2.5 pb-1 text-caption-2 font-medium text-primary underline-offset-2 hover:underline dark:text-lilac">
                    See: {i.guide.label}
                </a>
            )}
        </li>
    );

    return (
        <section
            ref={ref}
            id="fix-panel"
            aria-label="Fix before publishing"
            className={cn("mb-4 rounded-xl border bg-white p-3 shadow-sm dark:bg-dark-2", hard.length ? "border-error/50" : "border-warning/50")}
        >
            <div className="flex items-start justify-between gap-3 px-1.5 pb-1">
                <div>
                    <h3 className="text-body-sm font-semibold text-dark-1 dark:text-white">{hard.length ? `Fix before publishing (${hard.length})` : "Nothing stops publishing"}</h3>
                    <p className="text-caption-2 text-grey">{hard.length ? "Click an item to jump to it." : "These are worth a look. Click one to jump to it."}</p>
                </div>
                <button type="button" onClick={onClose} className="btn-ghost btn-sm shrink-0" aria-label="Close this list">
                    Close
                </button>
            </div>
            {hard.length > 0 && <ul className="flex flex-col">{hard.map((i, k) => row(i, k, "error"))}</ul>}
            {soft.length > 0 && (
                <div className={cn(hard.length > 0 && "mt-2 border-t border-grey-light/60 pt-2 dark:border-grey-light/10")}>
                    <h4 className="px-1.5 pb-1 text-caption-1 font-semibold text-grey">Worth a look (does not stop publishing)</h4>
                    <ul className="flex flex-col">{soft.map((i, k) => row(i, k, "warning"))}</ul>
                </div>
            )}
        </section>
    );
};

export default FixPanel;
