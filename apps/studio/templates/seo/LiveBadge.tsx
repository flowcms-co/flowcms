/** Small status pill: green "Live · {source}" when data is real, neutral "Sample data" otherwise. */
const LiveBadge = ({ live, source = "Search Console" }: { live: boolean; source?: string }) => (
    <span
        className={
            live
                ? "inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-[0.6875rem] font-bold text-success"
                : "inline-flex items-center gap-1.5 rounded-md bg-grey-light/60 px-2 py-0.5 text-[0.6875rem] font-bold text-grey dark:bg-dark-3"
        }
    >
        {live && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
        {live ? `Live · ${source}` : "Sample data"}
    </span>
);

export default LiveBadge;
