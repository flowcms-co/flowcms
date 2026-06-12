"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown in the root layout itself. It
 * replaces the whole document, so it ships its own <html>/<body> and uses inline
 * styles (the app stylesheet may not have loaded).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error("Fatal app error:", error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100dvh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
                    background: "#fff",
                    color: "#111827",
                    textAlign: "center",
                    padding: "0 1.5rem",
                }}
            >
                <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
                <p style={{ marginTop: "0.5rem", maxWidth: "28rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    The app hit an unexpected error. Reloading usually fixes it.
                </p>
                <button
                    onClick={() => reset()}
                    style={{
                        marginTop: "1.5rem",
                        background: "#6C5CE7",
                        color: "#fff",
                        border: 0,
                        borderRadius: "0.5rem",
                        padding: "0.625rem 1.25rem",
                        fontWeight: 600,
                        cursor: "pointer",
                    }}
                >
                    Try again
                </button>
            </body>
        </html>
    );
}
