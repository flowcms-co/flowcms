"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Icon from "@/components/ui/Icon";

type Props = {
    /** Glyph for the icon badge (defaults to a neutral info mark). */
    icon?: string;
    /** Short heading, e.g. "No activity yet". */
    title: string;
    /** One or two lines explaining why it's empty / what fills it. */
    description: string;
    /** Optional primary action (a link, e.g. "Run a scan" or "Create content"). */
    action?: { label: string; href: string };
    /** Optional custom action node (overrides `action`). */
    children?: ReactNode;
    /** `card` (default) draws a dashed bordered panel; `bare` is just the stack,
     *  for dropping inside a card that already exists. */
    variant?: "card" | "bare";
    className?: string;
};

/**
 * Canonical empty-state for internal CMS surfaces that have no data yet (a fresh
 * install, an unrun scan, an empty inbox). Replaces the old "fall back to demo
 * rows" behaviour so a new workspace shows the honest state with a way forward,
 * not fabricated sample data. Mirrors the UI_PATTERNS empty-state recipe.
 */
const EmptyState = ({ icon = "info", title, description, action, children, variant = "card", className }: Props) => {
    const inner = (
        <>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-dark-3">
                <Icon className="h-6 w-6 fill-primary dark:fill-lilac" name={icon} />
            </span>
            <h3 className="text-h5 text-black dark:text-white">{title}</h3>
            <p className="max-w-sm text-body-sm text-grey">{description}</p>
            {children ??
                (action && (
                    <Link href={action.href} className="btn-primary mt-1 h-10 px-4">
                        {action.label}
                    </Link>
                ))}
        </>
    );

    if (variant === "bare") {
        return <div className={`flex flex-col items-center justify-center gap-3 text-center ${className ?? ""}`}>{inner}</div>;
    }
    return (
        <div
            className={`flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-grey-light bg-white px-6 py-16 text-center dark:border-grey-light/10 dark:bg-dark-1 ${className ?? ""}`}
        >
            {inner}
        </div>
    );
};

export default EmptyState;
