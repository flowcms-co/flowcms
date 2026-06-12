/** Short relative-ish date label, e.g. "May 30". */
export function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Compact number, e.g. 12840 -> "12.8K". */
export function formatCount(n: number): string {
    if (n === 0) return "—";
    if (n < 1000) return String(n);
    if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
