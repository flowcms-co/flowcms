import { cn } from "@/lib/cn";

/** Small SEO score chip — color-graded by band (high/med/low); "—" when unscored. */
const SeoScoreBadge = ({ score }: { score: number | null }) => {
    if (score == null) {
        return (
            <span className="inline-flex items-center justify-center min-w-9 px-2 py-0.5 rounded-pill text-caption-2 tabular-nums bg-grey-light/60 text-grey">
                —
            </span>
        );
    }
    const band =
        score >= 80
            ? "bg-success/10 text-success"
            : score >= 60
              ? "bg-warning/10 text-warning"
              : "bg-error/10 text-error";
    return (
        <span
            className={cn(
                "inline-flex items-center justify-center min-w-9 px-2 py-0.5 rounded-pill text-caption-2 tabular-nums",
                band,
            )}
        >
            {score}
        </span>
    );
};

export default SeoScoreBadge;
