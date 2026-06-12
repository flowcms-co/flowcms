"use client";

import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/** Compact page list with ellipses: 1 … 4 5 6 … 20. Always shows first + last. */
const buildPages = (current: number, total: number): (number | "…")[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const out: (number | "…")[] = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) out.push("…");
    for (let i = start; i <= end; i++) out.push(i);
    if (end < total - 1) out.push("…");
    out.push(total);
    return out;
};

/**
 * One grouped pager: prev / page-numbers / next, on a single elevated surface.
 * Active page = flat purple fill (no glow — glow is reserved for action
 * buttons). Replaces the old pair of small secondary buttons.
 */
const Pagination = ({
    page,
    totalPages,
    onChange,
}: {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
}) => {
    if (totalPages <= 1) return null;
    const pages = buildPages(page, totalPages);
    const arrow =
        "inline-flex h-9 items-center gap-1 rounded-lg px-3 text-caption-1 font-semibold text-grey transition-colors hover:bg-lavender-mist hover:text-primary disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-dark-3 dark:hover:text-white";
    return (
        <nav
            aria-label="Pagination"
            className="inline-flex items-center gap-1 rounded-xl border border-grey-light bg-white p-1 shadow-[0_0.5rem_1.5rem_rgba(26,26,46,0.06)] dark:border-grey-light/10 dark:bg-dark-1 dark:shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.3)]"
        >
            <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} className={arrow}>
                <Icon className="h-4 w-4 fill-current" name="arrow-left" />
                <span className="hidden sm:inline">Prev</span>
            </button>

            {pages.map((p, i) =>
                p === "…" ? (
                    <span key={`gap-${i}`} className="select-none px-1.5 text-caption-1 text-grey">
                        …
                    </span>
                ) : (
                    <button
                        key={p}
                        type="button"
                        onClick={() => onChange(p)}
                        aria-current={p === page ? "page" : undefined}
                        className={cn(
                            "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-caption-1 font-semibold transition-colors",
                            p === page
                                ? "bg-primary text-white"
                                : "text-grey hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3 dark:hover:text-white",
                        )}
                    >
                        {p}
                    </button>
                ),
            )}

            <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages} className={arrow}>
                <span className="hidden sm:inline">Next</span>
                <Icon className="h-4 w-4 fill-current" name="arrow-right" />
            </button>
        </nav>
    );
};

export default Pagination;
