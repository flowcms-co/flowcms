"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Icon from "@/components/ui/Icon";
import { useJobs, type Job } from "@/components/providers/JobsProvider";

const ACTIVE = (s: Job["status"]) => s === "QUEUED" || s === "RUNNING";

/**
 * Bottom-right stack of small white cards showing background-job progress, then a
 * green-tick completion that auto-dismisses. The completion is also in the bell, so
 * nothing is lost. Pure enhancement over the JobsProvider state.
 */
const JobToasts = () => {
    const { jobs, dismiss } = useJobs();
    const reduce = useReducedMotion();
    if (!jobs.length) return null;

    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[20rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
            <AnimatePresence initial={false}>
                {jobs.map((j) => (
                    <motion.div
                        key={j.id}
                        layout={!reduce}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        className="pointer-events-auto"
                    >
                        <JobCard job={j} onDismiss={() => dismiss(j.id)} />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

const JobCard = ({ job, onDismiss }: { job: Job; onDismiss: () => void }) => {
    const active = ACTIVE(job.status);

    // Terminal jobs auto-dismiss after a few seconds.
    useEffect(() => {
        if (active) return;
        const t = setTimeout(onDismiss, 5500);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job.status]);

    const ok = job.status === "SUCCEEDED";
    const partial = job.status === "PARTIAL";
    const failed = job.status === "FAILED";

    return (
        <div className="flex items-start gap-3 rounded-2xl border border-grey-light bg-white p-3.5 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.16)] dark:border-grey-light/10 dark:bg-dark-1">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full">
                {active && <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
                {ok && <span className="grid h-7 w-7 place-items-center rounded-full bg-success/15"><Icon name="check" className="h-4 w-4 fill-success" /></span>}
                {partial && <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-500/15"><Icon name="check" className="h-4 w-4 fill-amber-500" /></span>}
                {failed && <span className="grid h-7 w-7 place-items-center rounded-full bg-error/15 text-error"><span className="text-caption-1 font-bold">!</span></span>}
            </span>

            <div className="min-w-0 flex-1">
                <p className="truncate text-caption-1 font-semibold text-black dark:text-white">{job.label || "Working…"}</p>
                {active ? (
                    <>
                        <p className="mt-0.5 text-caption-2 text-grey">{job.total ? `${job.completed} of ${job.total}` : "Working…"}{job.failed ? ` · ${job.failed} failed` : ""}</p>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-lavender-mist dark:bg-dark-3">
                            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(4, job.progress)}%` }} />
                        </div>
                    </>
                ) : (
                    <p className="mt-0.5 text-caption-2 text-grey">
                        {ok && `${job.completed} completed.`}
                        {partial && `${job.completed} done, ${job.failed} failed.`}
                        {failed && (job.error || "The task failed.")}
                    </p>
                )}
            </div>

            <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-grey hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3">
                <Icon name="close" className="h-3.5 w-3.5 fill-current" />
            </button>
        </div>
    );
};

export default JobToasts;
