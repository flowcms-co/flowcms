import { cn } from "@/lib/cn";

export type PillStatus =
    | "live"
    | "scheduled"
    | "review"
    | "draft"
    | "approved";

const LABEL: Record<PillStatus, string> = {
    live: "Live",
    scheduled: "Scheduled",
    review: "Review",
    draft: "Draft",
    approved: "Approved",
};

/** Status → color (FlowCMS §7 status pill mapping). */
const STYLE: Record<PillStatus, string> = {
    live: "bg-success/10 text-success",
    scheduled: "bg-info/10 text-info",
    review: "bg-primary/10 text-primary",
    draft: "bg-grey/10 text-grey",
    approved: "bg-lilac/15 text-purple-600 dark:text-lilac",
};

const StatusPill = ({
    status,
    className,
}: {
    status: PillStatus;
    className?: string;
}) => (
    <span
        className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[0.5rem] text-caption-2",
            STYLE[status],
            className,
        )}
    >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        {LABEL[status]}
    </span>
);

export default StatusPill;
