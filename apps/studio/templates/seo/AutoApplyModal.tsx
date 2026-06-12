"use client";

import { Fragment, useMemo, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { useJobs } from "@/components/providers/JobsProvider";

type Page = { id: string | null; url: string | null; title: string | null };
type Group = { key: string; title: string; fix: string; pages: Page[] };

/** Codes/fixes that are safe to apply with no AI and no judgement (deterministic, lossless). */
const SAFE_KEYS = new Set(["TECH_CANONICAL_MISSING", "TECH_NOINDEX", "INTERNAL_LINK_OPP"]);
export const isSafeGroup = (g: { key: string; fix: string }) => SAFE_KEYS.has(g.key) || g.fix === "links";

/**
 * "Auto-apply safe": kicks off a background job that applies every deterministic,
 * free, lossless fix across the workspace (self-canonical, remove-noindex, internal
 * links). It returns immediately so the app is never blocked; progress shows in the
 * bottom toast and the result lands in the bell. AI-written fixes stay explicit.
 */
const AutoApplyModal = ({ open, groups, onClose, onApplied }: { open: boolean; groups: Group[]; onClose: () => void; onApplied?: () => void }) => {
    const { enqueue } = useJobs();
    const [starting, setStarting] = useState(false);

    const counts = useMemo(() => {
        const safe = groups.filter(isSafeGroup);
        const canonical = safe.find((g) => g.key === "TECH_CANONICAL_MISSING")?.pages.filter((p) => p.id).length ?? 0;
        const noindex = safe.find((g) => g.key === "TECH_NOINDEX")?.pages.filter((p) => p.id).length ?? 0;
        const links = safe.some((g) => g.key === "INTERNAL_LINK_OPP" || g.fix === "links");
        return { canonical, noindex, links, total: canonical + noindex + (links ? 1 : 0) };
    }, [groups]);

    const start = async () => {
        setStarting(true);
        try {
            await enqueue("/seo/scan/jobs/auto-apply-safe", {}, "Apply safe SEO fixes");
            onApplied?.();
            onClose();
        } finally {
            setStarting(false);
        }
    };

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <Icon className="h-5 w-5 fill-primary" name="check" />
                                    <Dialog.Title className="text-h5 text-black dark:text-white">Auto-apply safe fixes</Dialog.Title>
                                </div>
                                <p className="mb-4 text-caption-2 text-grey">
                                    These deterministic fixes are free, lossless and reversible (a version is kept). They run in the background, so you can keep working; you&rsquo;ll get a notification when they finish.
                                </p>

                                {counts.total === 0 ? (
                                    <p className="rounded-2xl bg-success/10 px-4 py-6 text-body-sm text-success">No safe fixes pending. Everything deterministic is already applied.</p>
                                ) : (
                                    <ul className="flex flex-col gap-2">
                                        {counts.canonical > 0 && <Item label={`Add a self-canonical to ${counts.canonical} page${counts.canonical === 1 ? "" : "s"}`} />}
                                        {counts.noindex > 0 && <Item label={`Remove noindex from ${counts.noindex} page${counts.noindex === 1 ? "" : "s"}`} />}
                                        {counts.links && <Item label="Add the contextual internal links found across your content" />}
                                    </ul>
                                )}

                                <div className="mt-6 flex items-center justify-end gap-2">
                                    <button type="button" onClick={onClose} className="btn-ghost h-9 px-4 text-caption-1">Cancel</button>
                                    {counts.total > 0 && (
                                        <button type="button" onClick={start} disabled={starting} className="btn-primary h-9 gap-1.5 px-4 text-caption-1 disabled:opacity-60">
                                            <Icon className="h-4 w-4 fill-white" name="check" />
                                            {starting ? "Starting…" : "Apply safe fixes"}
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

const Item = ({ label }: { label: string }) => (
    <li className="flex items-center gap-2 rounded-xl bg-lavender-mist/50 px-3 py-2.5 text-caption-1 text-black dark:bg-dark-3/40 dark:text-white">
        <Icon className="h-4 w-4 shrink-0 fill-primary" name="check" />
        {label}
    </li>
);

export default AutoApplyModal;
