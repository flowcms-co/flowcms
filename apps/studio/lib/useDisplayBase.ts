"use client";

import { useEffect, useState } from "react";
import { DISPLAY_BASE, browserDisplayBase } from "./api";

/**
 * The public API base to show in copy-paste docs / snippets. Starts at the
 * SSR-safe `DISPLAY_BASE` (a friendly placeholder for relative/localhost builds)
 * and, after mount, resolves the real value from `window.location.origin`. This
 * lets the single domain-agnostic production image (built with a relative `/api`
 * base) still show the user's actual URL — without an SSR/CSR hydration mismatch.
 */
export function useDisplayBase(): string {
    const [base, setBase] = useState(DISPLAY_BASE);
    useEffect(() => {
        setBase(browserDisplayBase());
    }, []);
    return base;
}
