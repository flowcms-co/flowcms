"use client";

import { Fragment, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import StatusPill, { type PillStatus } from "@/components/ui/StatusPill";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { confirm } from "@/components/providers/ConfirmProvider";

type Version = { id: string; versionNumber: number; status: string; title: string; author: string | null; createdAt: string };

const STATUS_MAP: Record<string, PillStatus> = { DRAFT: "draft", IN_REVIEW: "review", APPROVED: "approved", SCHEDULED: "scheduled", PUBLISHED: "live", ARCHIVED: "draft" };

/** Version history for one entry — list snapshots + restore an older one. */
const VersionsModal = ({ entryId, title, onClose, onRestored }: { entryId: string | null; title: string; onClose: () => void; onRestored: () => void }) => {
    const [versions, setVersions] = useState<Version[] | null>(null);
    const [restoring, setRestoring] = useState<string | null>(null);

    useEffect(() => {
        if (!entryId) return;
        setVersions(null);
        api<Version[]>(`/entries/${entryId}/versions`).then(setVersions).catch(() => setVersions([]));
    }, [entryId]);

    const restore = async (versionId: string) => {
        if (!entryId || restoring) return;
        if (!(await confirm({ title: "Restore this version?", message: "The current content becomes a new version in the history.", confirmLabel: "Restore" }))) return;
        setRestoring(versionId);
        try {
            await api(`/entries/${entryId}/versions/${versionId}/restore`, { method: "POST" });
            onRestored();
            onClose();
        } catch {
            setRestoring(null);
        }
    };

    return (
        <Transition appear show={!!entryId} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <Dialog.Title className="text-h5 text-black dark:text-white">Version history</Dialog.Title>
                                <p className="mt-0.5 mb-5 truncate text-caption-2 text-grey">{title}</p>

                                {versions === null ? (
                                    <div className="py-10 text-center text-body-sm text-grey">Loading…</div>
                                ) : versions.length === 0 ? (
                                    <div className="py-10 text-center text-body-sm text-grey">No versions recorded yet.</div>
                                ) : (
                                    <div className="flex max-h-[24rem] flex-col gap-2 overflow-y-auto">
                                        {versions.map((v, i) => (
                                            <div key={v.id} className="flex items-center gap-3 rounded-2xl border border-grey-light p-3 dark:border-grey-light/10">
                                                <span className="flex items-center justify-center w-9 h-9 rounded-[0.75rem] bg-lavender-mist text-caption-1 font-bold text-primary shrink-0 dark:bg-dark-3 dark:text-lilac">v{v.versionNumber}</span>
                                                <div className="min-w-0 grow">
                                                    <div className="truncate text-title text-black dark:text-white">{v.title}</div>
                                                    <div className="text-caption-2 text-grey" suppressHydrationWarning>{v.author ? `${v.author} · ` : ""}{formatDate(v.createdAt)}</div>
                                                </div>
                                                <StatusPill status={STATUS_MAP[v.status] ?? "draft"} className="shrink-0" />
                                                {i === 0 ? (
                                                    <span className="shrink-0 px-2.5 py-1 text-caption-2 font-semibold text-grey">Current</span>
                                                ) : (
                                                    <button type="button" onClick={() => restore(v.id)} disabled={!!restoring} className="btn-secondary h-8 px-3 text-caption-2 shrink-0 disabled:opacity-60">
                                                        {restoring === v.id ? "Restoring…" : "Restore"}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button type="button" onClick={onClose} className="btn-secondary w-full mt-6">Close</button>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default VersionsModal;
