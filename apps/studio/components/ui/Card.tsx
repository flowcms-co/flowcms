"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useScrollReveal } from "@/lib/useReveal";

/**
 * Base surface card — Unity ".widget": borderless, 24px radius, 32px padding,
 * soft tinted elevation. No line dividers (FlowCMS brand direction).
 * Pass a `tint` for Unity's accent cards (pink / purple / etc.).
 *
 * Every card reveals (fade + rise) as it scrolls into view — the project-wide
 * scroll-reveal. The hook self-skips inside modals / already-animated rows and
 * respects reduced-motion + focus. Pass `reveal={false}` to opt a card out.
 */
type CardTint = "white" | "pink" | "purple" | "mist";

const TINT: Record<CardTint, string> = {
    white: "bg-white dark:bg-dark-1",
    pink: "bg-[#FFEBF6] dark:bg-secondary",
    purple: "bg-primary text-white",
    mist: "bg-lavender-mist dark:bg-dark-3",
};

const Card = ({
    children,
    className,
    tint = "white",
    flush = false,
    reveal = true,
    id,
}: {
    children: ReactNode;
    className?: string;
    tint?: CardTint;
    /** flush = no padding (for cards that manage their own inner spacing). */
    flush?: boolean;
    /** Opt out of the scroll-reveal (e.g. tiny inline cards). */
    reveal?: boolean;
    /** Optional element id (e.g. for in-page #anchor links). */
    id?: string;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    useScrollReveal(ref);
    return (
        <div
            ref={ref}
            id={id}
            data-no-reveal={reveal ? undefined : ""}
            className={cn(
                "rounded-3xl shadow-[0_0.5rem_2rem_rgba(227,230,236,0.55)] dark:shadow-[0_0.5rem_2rem_rgba(0,0,0,0.30)]",
                TINT[tint],
                !flush && "p-8",
                className,
            )}
        >
            {children}
        </div>
    );
};

export default Card;
