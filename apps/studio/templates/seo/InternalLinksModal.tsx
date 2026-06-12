"use client";

import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";

type Opportunity = { sourceId: string; sourceTitle: string; targetId: string; targetTitle: string; targetUrl: string; anchor: string; snippet: string };

/**
 * In-place internal-linking: discovers contextual opportunities (a page mentions
 * another page's topic without linking), shows source -> anchor -> target + the
 * SEO impact, and applies the link in one click. No leaving the AI Optimizer.
 */
const InternalLinksModal = ({ open, onClose, onApplied }: { open: boolean; onClose: () => void; onApplied?: () => void }) => {
    const [opps, setOpps] = useState<Opportunity[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [done, setDone] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the modal loads opportunities
        setLoading(true);
        setError(null);
        setDone(new Set());
        api<{ opportunities: Opportunity[] }>("/seo/internal-links")
            .then((d) => setOpps(d.opportunities ?? []))
            .catch(() => setError("Couldn't load internal-link opportunities."))
            .finally(() => setLoading(false));
    }, [open]);

    const key = (o: Opportunity) => `${o.sourceId}:${o.targetId}:${o.anchor}`;

    const apply = async (o: Opportunity) => {
        setBusy(key(o));
        setError(null);
        try {
            await api("/seo/internal-links/apply", { method: "POST", body: JSON.stringify({ sourceId: o.sourceId, targetId: o.targetId, anchor: o.anchor }) });
            setDone((s) => new Set(s).add(key(o)));
            onApplied?.();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Couldn't add the link.");
        } finally {
            setBusy(null);
        }
    };

    const applyAll = async () => {
        for (const o of opps) {
            if (done.has(key(o))) continue;
            await apply(o);
        }
    };

    const remaining = opps.filter((o) => !done.has(key(o)));

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="mb-1 flex items-center gap-2">
                                    <Icon className="h-5 w-5 fill-primary" name="external" />
                                    <Dialog.Title className="text-h5 text-black dark:text-white">Internal linking opportunities</Dialog.Title>
                                </div>
                                <p className="mb-4 text-caption-2 text-grey">
                                    Each page below mentions another page&rsquo;s topic without linking to it. Adding the link passes authority and helps both pages rank. Applying saves a version of the source page.
                                </p>

                                {loading && (
                                    <div className="flex items-center gap-3 rounded-2xl bg-lavender-mist/60 px-4 py-6 text-body-sm text-grey dark:bg-dark-3/50">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Scanning your content graph…
                                    </div>
                                )}
                                {error && <div className="rounded-2xl bg-error/10 px-4 py-3 text-body-sm text-error">{error}</div>}

                                {!loading && opps.length === 0 && !error && (
                                    <p className="rounded-2xl bg-success/10 px-4 py-3 text-body-sm text-success">No new internal-link opportunities. Nicely linked.</p>
                                )}

                                {!loading && opps.length > 0 && (
                                    <div className="flex max-h-[26rem] flex-col gap-2 overflow-auto pr-1 scrollbar-thin">
                                        {opps.map((o) => {
                                            const k = key(o);
                                            const applied = done.has(k);
                                            return (
                                                <div key={k} className="rounded-2xl border border-grey-light p-3 dark:border-grey-light/10">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-body-sm text-black dark:text-white">
                                                                <span className="font-semibold">{o.sourceTitle}</span>
                                                                <span className="text-grey"> → link </span>
                                                                <span className="rounded bg-lavender-mist px-1.5 font-semibold text-primary dark:bg-dark-3 dark:text-lilac">{o.anchor}</span>
                                                                <span className="text-grey"> → </span>
                                                                <span className="font-semibold">{o.targetTitle}</span>
                                                            </div>
                                                            {o.snippet && <p className="mt-1 truncate text-caption-2 text-grey">…{o.snippet}…</p>}
                                                        </div>
                                                        {applied ? (
                                                            <span className="inline-flex shrink-0 items-center gap-1 text-caption-1 font-semibold text-success">
                                                                <Icon className="h-4 w-4 fill-success" name="check" /> Added
                                                            </span>
                                                        ) : (
                                                            <button type="button" onClick={() => apply(o)} disabled={busy === k} className="btn-secondary btn-sm shrink-0 disabled:opacity-60">
                                                                {busy === k ? "Adding…" : "Add link"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="mt-6 flex items-center justify-end gap-2">
                                    {remaining.length > 1 && <button type="button" onClick={applyAll} disabled={!!busy} className="btn-secondary h-9 px-4 text-caption-1 disabled:opacity-60">Add all ({remaining.length})</button>}
                                    <button type="button" onClick={onClose} className="btn-primary h-9 px-4 text-caption-1">Done</button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default InternalLinksModal;
