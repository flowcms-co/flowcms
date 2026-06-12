"use client";

import { Fragment, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { useJobs } from "@/components/providers/JobsProvider";

export type BatchPage = { id: string | null; url: string | null; title: string | null };
export type BatchGroup = { key: string; title: string; fix: string; pages: BatchPage[] };

/** Deterministic (no AI) fix kinds — applied as rule-based edits, no tokens spent. */
const isDeterministic = (key: string) => key === "TECH_CANONICAL_MISSING" || key === "TECH_NOINDEX";

/**
 * Confirms a "fix all pages in this group" run, then enqueues a background job and
 * returns immediately, so the app is never blocked. Progress shows in the bottom
 * toast; the result lands in the notifications bell. AI fixes route free -> paid by
 * the plan inside the job.
 */
const BatchFixModal = ({ group, onClose, onApplied }: { group: BatchGroup | null; onClose: () => void; onApplied?: () => void }) => {
    const { enqueue } = useJobs();
    const [starting, setStarting] = useState(false);

    const managed = useMemo(() => (group?.pages ?? []).filter((p) => p.id), [group]);
    const det = group ? isDeterministic(group.key) : false;

    const start = async () => {
        if (!group) return;
        setStarting(true);
        try {
            await enqueue(
                "/seo/scan/jobs/batch-fix",
                { fix: group.fix, key: group.key, title: group.title, pages: managed.map((p) => ({ id: p.id, url: p.url })) },
                `Fix ${managed.length} page${managed.length === 1 ? "" : "s"} · ${group.title}`,
            );
            onApplied?.();
            onClose();
        } finally {
            setStarting(false);
        }
    };

    return (
        <Transition appear show={!!group} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <Icon className="h-5 w-5 fill-primary" name={det ? "check" : "sparkles"} />
                                    <Dialog.Title className="text-h5 text-black dark:text-white">{det ? "Fix all" : "Fix all with AI"} · {group?.title}</Dialog.Title>
                                </div>
                                <p className="mb-4 text-caption-2 text-grey">
                                    {det
                                        ? `This applies the fix to all ${managed.length} affected page${managed.length === 1 ? "" : "s"} in the background.`
                                        : `AI fixes all ${managed.length} affected page${managed.length === 1 ? "" : "s"} in the background (routed to the cheapest capable model your plan allows).`}
                                    {" "}You can keep working; a version is kept for each page, so it&rsquo;s reversible, and you&rsquo;ll get a notification when it&rsquo;s done.
                                </p>

                                {managed.length === 0 ? (
                                    <p className="rounded-2xl bg-lavender-mist/60 px-4 py-6 text-body-sm text-grey dark:bg-dark-3/50">No managed pages to fix here. Open Review to fix pages individually.</p>
                                ) : (
                                    <ul className="flex max-h-[16rem] flex-col gap-1 overflow-auto pr-1 scrollbar-thin">
                                        {managed.slice(0, 40).map((p) => (
                                            <li key={p.id} className="truncate rounded-lg bg-lavender-mist/40 px-3 py-1.5 text-caption-2 text-grey dark:bg-dark-3/40">{p.title ?? p.url ?? "Untitled"}</li>
                                        ))}
                                        {managed.length > 40 && <li className="px-3 text-caption-2 text-grey">+ {managed.length - 40} more</li>}
                                    </ul>
                                )}

                                <div className="mt-6 flex items-center justify-end gap-2">
                                    <button type="button" onClick={onClose} className="btn-ghost h-9 px-4 text-caption-1">Cancel</button>
                                    {managed.length > 0 && (
                                        <button type="button" onClick={start} disabled={starting} className="btn-primary h-9 gap-1.5 px-4 text-caption-1 disabled:opacity-60">
                                            {!det && <Icon className="h-4 w-4 fill-white" name="sparkles" />}
                                            {starting ? "Starting…" : det ? `Fix all ${managed.length}` : `Fix all ${managed.length} with AI`}
                                        </button>
                                    )}
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default BatchFixModal;
