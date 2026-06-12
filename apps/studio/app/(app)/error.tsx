"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for the authenticated studio. Catches render-time
 * exceptions (e.g. an unexpected API shape) so a single broken page shows a
 * recoverable message instead of a blank screen.
 */
export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        // Surface for diagnostics; no sensitive data is included in client errors.
        console.error("Studio render error:", error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-[0.75rem] bg-[#6C5CE7]/10 text-2xl">⚠️</div>
            <h1 className="font-poppins mt-5 text-xl font-bold">Something went wrong</h1>
            <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground,#6b7280)]">
                This page hit an unexpected error. You can try again, and if it keeps happening, reload the app.
            </p>
            <div className="mt-6 flex gap-3">
                <button className="btn-primary" onClick={() => reset()}>
                    Try again
                </button>
                <button className="btn-secondary" onClick={() => (window.location.href = "/")}>
                    Back to dashboard
                </button>
            </div>
        </div>
    );
}
