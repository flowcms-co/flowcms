"use client";

import { cn } from "@/lib/cn";

export type SaveState = "saved" | "dirty" | "saving";

/**
 * Save-state indicator with a fixed min width (so the surrounding toolbar never
 * jumps as the label changes): a spinner while saving, a drawn check + "Saved"
 * when clean, a dot + "Unsaved" when dirty. The check re-draws each time it
 * returns to the saved state (keyed remount). Respects prefers-reduced-motion.
 */
const SaveStatus = ({ state, className }: { state: SaveState; className?: string }) => (
    <span className={cn("inline-flex min-w-[5.25rem] items-center gap-1.5 text-caption-2 font-medium", className)}>
        {state === "saving" ? (
            <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-grey/30 border-t-primary" />
                <span className="text-grey">Saving…</span>
            </>
        ) : state === "dirty" ? (
            <>
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                <span className="text-grey">Unsaved</span>
            </>
        ) : (
            <>
                <svg key="saved" className="saved-check h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path pathLength={1} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-success">Saved</span>
            </>
        )}
    </span>
);

export default SaveStatus;
