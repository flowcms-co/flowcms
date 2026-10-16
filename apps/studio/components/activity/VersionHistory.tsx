"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { api, ApiError, mediaUrl } from "@/lib/api";
import { isImageRef, preview, topFields, type FieldChange } from "@/lib/activity";
import { useAuth } from "@/components/providers/AuthProvider";
import ChangeList from "@/components/activity/ChangeList";
import { cn } from "@/lib/cn";

export type Version = {
    id: string;
    versionNumber: number;
    status: string;
    label: "draft" | "published";
    note: string | null;
    title: string;
    author: string | null;
    createdAt: string;
    updatedAt?: string;
};

type VersionDetail = Version & { data: Record<string, unknown>; diffFromLive: FieldChange[] | null; diffFromCurrent: FieldChange[] };

const LabelBadge = ({ label }: { label: Version["label"] }) => (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide", label === "published" ? "bg-success/15 text-success" : "bg-grey-light text-grey dark:bg-dark-3")}>
        {label}
    </span>
);

/**
 * Version history for one entry: who made each version and whether it was a draft
 * or what went live. Opening a version shows a read-only preview and what it
 * differs by from the live page; restoring asks for confirmation with that diff,
 * an optional reason, draft or publish-now, and optionally only some fields.
 */
const VersionHistory = ({ entryId, onRestored, variant = "panel" }: { entryId: string; onRestored: () => void; variant?: "panel" | "modal" }) => {
    const [versions, setVersions] = useState<Version[] | null>(null);
    const [open, setOpen] = useState<string | null>(null);

    const load = useCallback(() => {
        setVersions(null);
        api<Version[]>(`/entries/${entryId}/versions`).then(setVersions).catch(() => setVersions([]));
    }, [entryId]);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open / entry change
        load();
    }, [load]);

    if (versions === null) return <p className="py-6 text-center text-caption-2 text-grey">Loading…</p>;
    if (versions.length === 0) return <p className="py-6 text-center text-caption-2 text-grey">No versions yet. Saves, publishes and restores are kept here.</p>;

    return (
        <>
            <ul className={cn("flex flex-col", variant === "modal" && "max-h-[24rem] overflow-y-auto")}>
                {versions.map((v, i) => (
                    <li key={v.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {i < versions.length - 1 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-grey-light dark:bg-grey-light/10" />}
                        <span className={cn("relative z-1 mt-1 shrink-0 w-3 h-3 rounded-full border-2", i === 0 ? "bg-primary border-primary" : "bg-white border-grey-light dark:bg-dark-1")} />
                        <button type="button" onClick={() => setOpen(v.id)} className="grow rounded-lg text-left transition-colors hover:bg-lavender-mist/60 dark:hover:bg-dark-3/50 -mx-1.5 px-1.5 py-0.5">
                            <div className="flex items-center gap-2">
                                <span className="text-body-sm font-semibold text-black dark:text-white">v{v.versionNumber}</span>
                                <LabelBadge label={v.label} />
                                {i === 0 && <span className="text-caption-2 text-grey">current</span>}
                            </div>
                            <div className="text-caption-2 text-grey" suppressHydrationWarning>
                                {v.author ?? "Unknown"} · {new Date(v.updatedAt ?? v.createdAt).toLocaleString()}
                            </div>
                            {v.note && <div className="text-caption-2 italic text-grey">{v.note}</div>}
                        </button>
                    </li>
                ))}
            </ul>
            <VersionModal
                entryId={entryId}
                versionId={open}
                isCurrent={open === versions[0]?.id}
                onClose={() => setOpen(null)}
                onRestored={() => {
                    setOpen(null);
                    load();
                    onRestored();
                }}
            />
        </>
    );
};

const VersionModal = ({ entryId, versionId, isCurrent, onClose, onRestored }: { entryId: string; versionId: string | null; isCurrent: boolean; onClose: () => void; onRestored: () => void }) => {
    const { can } = useAuth();
    const [detail, setDetail] = useState<VersionDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<"changes" | "preview">("changes");
    const [restoring, setRestoring] = useState(false);
    const [mode, setMode] = useState<"draft" | "publish">("draft");
    const [reason, setReason] = useState("");
    const [fields, setFields] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!versionId) return;
        /* eslint-disable react-hooks/set-state-in-effect -- reset before loading the next version */
        setDetail(null);
        setError(null);
        setView("changes");
        setRestoring(false);
        setMode("draft");
        setReason("");
        setFields([]);
        /* eslint-enable react-hooks/set-state-in-effect */
        api<VersionDetail>(`/entries/${entryId}/versions/${versionId}`)
            .then(setDetail)
            .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load this version."));
    }, [entryId, versionId]);

    const canRestore = can("content.restore");
    const canPublish = can("content.publish");
    // What restoring changes: against the live page when there is one, else the content being edited.
    const changes = detail ? (detail.diffFromLive ?? detail.diffFromCurrent) : [];
    const fieldChoices = detail ? topFields(detail.diffFromCurrent) : [];

    const restore = async () => {
        if (!detail) return;
        setBusy(true);
        setError(null);
        try {
            await api(`/entries/${entryId}/versions/${detail.id}/restore`, {
                method: "POST",
                body: JSON.stringify({ mode, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(fields.length ? { fields } : {}) }),
            });
            onRestored();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Restore failed.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Transition appear show={!!versionId} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                            <Dialog.Panel className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white p-6 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                {!detail ? (
                                    <div className="py-10 text-center text-body-sm text-grey">{error ?? "Loading…"}</div>
                                ) : (
                                    <>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <Dialog.Title className="flex items-center gap-2 text-h5 text-black dark:text-white">
                                                    Version {detail.versionNumber} <LabelBadge label={detail.label} />
                                                </Dialog.Title>
                                                <p className="mt-0.5 text-caption-2 text-grey" suppressHydrationWarning>
                                                    {detail.author ?? "Unknown"} · {new Date(detail.updatedAt ?? detail.createdAt).toLocaleString()}
                                                    {detail.note ? ` · ${detail.note}` : ""}
                                                </p>
                                            </div>
                                            <div className="flex shrink-0 gap-1 rounded-xl bg-lavender-mist p-1 dark:bg-dark-3">
                                                {(["changes", "preview"] as const).map((t) => (
                                                    <button key={t} type="button" onClick={() => setView(t)} className={cn("h-8 rounded-lg px-3 text-caption-1 font-semibold", view === t ? "bg-white text-primary shadow-sm dark:bg-dark-1" : "text-grey")}>
                                                        {t === "changes" ? "Changes" : "Preview"}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mt-4 min-h-0 grow overflow-y-auto pr-1">
                                            {view === "changes" ? (
                                                <>
                                                    <p className="mb-2 text-caption-2 text-grey">
                                                        {detail.diffFromLive ? "Fields where this version differs from the live page:" : "Fields where this version differs from the current content:"}
                                                    </p>
                                                    <ChangeList changes={changes} />
                                                </>
                                            ) : (
                                                <dl className="flex flex-col gap-2.5">
                                                    {Object.entries(detail.data).map(([k, v]) => (
                                                        <div key={k} className="rounded-xl border border-grey-light/70 p-2.5 dark:border-grey-light/10">
                                                            <dt className="mb-1 font-mono text-[0.6875rem] text-primary dark:text-lilac">{k}</dt>
                                                            <dd className="text-caption-2 text-black dark:text-white">
                                                                {isImageRef(v) ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img src={mediaUrl(v)} alt={k} className="h-24 rounded-lg object-cover" />
                                                                ) : (
                                                                    <span className="break-words">{preview(v, 600)}</span>
                                                                )}
                                                            </dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            )}
                                        </div>

                                        {error && <div className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-caption-1 text-error">{error}</div>}

                                        {restoring && (
                                            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-grey-light p-4 dark:border-grey-light/10">
                                                <div className="flex flex-col gap-1.5">
                                                    {(
                                                        [
                                                            ["draft", "Restore as a draft", "Goes through review; the live page is unchanged until it's approved and published."],
                                                            ["publish", "Restore and publish now", "Replaces the live page now and tells your site to refresh."],
                                                        ] as const
                                                    ).map(([m, label, help]) => (
                                                        <label key={m} className={cn("flex items-start gap-2.5", m === "publish" && !canPublish && "opacity-50")}>
                                                            <input type="radio" name="restore-mode" checked={mode === m} disabled={m === "publish" && !canPublish} onChange={() => setMode(m)} className="mt-1 h-4 w-4 accent-primary" />
                                                            <span>
                                                                <span className="block text-body-sm text-black dark:text-white">{label}</span>
                                                                <span className="block text-caption-2 text-grey">{help}</span>
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                                {fieldChoices.length > 1 && (
                                                    <fieldset>
                                                        <legend className="mb-1 text-caption-1 text-black dark:text-white">Restore only these fields (leave all unticked for the whole version)</legend>
                                                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                                                            {fieldChoices.map((f) => (
                                                                <label key={f} className="flex items-center gap-1.5 text-caption-1 text-black dark:text-white">
                                                                    <input type="checkbox" checked={fields.includes(f)} onChange={(e) => setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))} className="h-4 w-4 accent-primary" />
                                                                    <code className="font-mono">{f}</code>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </fieldset>
                                                )}
                                                <label className="block">
                                                    <span className="mb-1 block text-caption-1 text-black dark:text-white">Reason (optional, kept in the activity log)</span>
                                                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={1000} className="flow-input min-h-0 py-2" placeholder="e.g. FAQ answer was wrong" />
                                                </label>
                                                <p className="text-caption-2 text-grey">This adds a new version noted “restored from v{detail.versionNumber}”. Nothing in the history is overwritten.</p>
                                            </div>
                                        )}

                                        <div className="mt-5 flex flex-wrap gap-3">
                                            <button type="button" onClick={onClose} className="btn-secondary grow">Close</button>
                                            {!isCurrent && canRestore && !restoring && (
                                                <button type="button" onClick={() => setRestoring(true)} className="btn-primary grow">Restore…</button>
                                            )}
                                            {restoring && (
                                                <button type="button" onClick={restore} disabled={busy} className="btn-primary grow disabled:opacity-60">
                                                    {busy ? "Restoring…" : mode === "publish" ? `Restore v${detail.versionNumber} and publish` : `Restore v${detail.versionNumber} as draft`}
                                                </button>
                                            )}
                                        </div>
                                        {!isCurrent && !canRestore && <p className="mt-2 text-caption-2 text-grey">Your role can&apos;t restore versions. A Super Admin can give your role the Restore permission.</p>}
                                    </>
                                )}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default VersionHistory;
