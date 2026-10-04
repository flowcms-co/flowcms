/** Small status pill: green "Live · {source}" when data is real; otherwise a neutral
 *  pill saying why there is nothing to show ("Not connected", "No data yet", …).
 *  No sample numbers are ever rendered, so it never claims "Sample data". */
const LiveBadge = ({ live, source = "Search Console", reason = "No data yet" }: { live: boolean; source?: string; reason?: string }) => (
    <span
        className={
            live
                ? "inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-[0.6875rem] font-bold text-success"
                : "inline-flex items-center gap-1.5 rounded-md bg-grey-light/60 px-2 py-0.5 text-[0.6875rem] font-bold text-grey dark:bg-dark-3"
        }
    >
        {live && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
        {live ? `Live · ${source}` : reason}
    </span>
);

export default LiveBadge;
