import Link from "next/link";

/**
 * Shown across AI tools when no provider is connected — a single, consistent
 * call to action that links to the integrations settings.
 */
const ConnectNotice = ({ tool }: { tool?: string }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-lavender-mist/70 px-4 py-3 dark:bg-dark-2">
        <span className="text-body-sm text-black dark:text-white">
            Connect an AI provider{tool ? ` to use ${tool}` : ""}.
        </span>
        <Link href="/settings/integrations" className="btn-primary h-9 px-3 text-caption-1 shrink-0">
            Connect provider
        </Link>
    </div>
);

export default ConnectNotice;
