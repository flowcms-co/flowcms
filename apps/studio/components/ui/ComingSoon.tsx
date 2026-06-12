import Icon from "@/components/ui/Icon";

/**
 * Placeholder empty-state for screens scheduled in later phases, so the shell is
 * fully navigable now. Each is replaced by the real screen per FlowCMS §7.
 */
const ComingSoon = ({ label }: { label: string }) => (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-grey-light bg-white px-6 py-20 text-center dark:bg-dark-1 dark:border-grey-light/10">
        <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-lavender-mist dark:bg-dark-3">
            <Icon className="fill-primary" name="sparkles" />
        </span>
        <h3 className="text-h5 text-black dark:text-white">{label}</h3>
        <p className="max-w-sm text-body text-grey">
            This screen is part of a later build phase. The shell, navigation, and
            design system are wired and ready for it.
        </p>
    </div>
);

export default ComingSoon;
