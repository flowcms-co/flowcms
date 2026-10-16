"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { confirm, notice } from "@/components/providers/ConfirmProvider";
import { api, ApiError, API_BASE } from "@/lib/api";
import { useWorkspace } from "@/lib/useWorkspace";

type Snapshot = { id: string; kind: string; note: string | null; counts: { types: number; entries: number; media: number }; sizeBytes: number; createdBy: string | null; createdAt: string };

const KIND_LABEL: Record<string, string> = { daily: "Daily", manual: "Manual", "pre-bulk-delete": "Before a bulk delete", "pre-rollback": "Before a rollback" };
const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

/**
 * Super Admin only: whole-workspace snapshots of content and media, and the
 * one-step master rollback to one (for a mass delete, accidental or not).
 */
const SafetyNetCard = () => {
    const workspace = useWorkspace();
    const [list, setList] = useState<Snapshot[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const refresh = () => api<Snapshot[]>("/backups").then(setList).catch(() => setList([]));
    useEffect(() => {
        void refresh();
    }, []);

    const snapshot = async () => {
        setBusy("new");
        try {
            await api("/backups", { method: "POST", body: JSON.stringify({}) });
            await refresh();
        } catch (e) {
            void notice({ title: "Snapshot failed", message: e instanceof ApiError ? e.message : "Please try again.", tone: "danger" });
        } finally {
            setBusy(null);
        }
    };

    const rollback = async (s: Snapshot) => {
        const when = new Date(s.createdAt).toLocaleString();
        const ok = await confirm({
            title: `Roll the whole workspace back to ${when}?`,
            message: `Every content type, entry (${s.counts.entries}) and media file (${s.counts.media}) goes back to how it was then. Anything created since is removed; files go to Deleted items. A snapshot of right now is taken first, so you can undo this. Users, roles and settings are not touched.`,
            confirmLabel: "Roll back",
            tone: "danger",
        });
        if (!ok) return;
        setBusy(s.id);
        try {
            const r = await api<{ counts: Snapshot["counts"] }>(`/backups/${s.id}/rollback`, { method: "POST", body: JSON.stringify({ confirm: workspace?.name ?? "" }) });
            void notice({ title: "Workspace rolled back", message: `${r.counts.entries} entries and ${r.counts.media} files restored. Your site was told to refresh. To undo, roll back to the “Before a rollback” snapshot.` });
            await refresh();
        } catch (e) {
            void notice({ title: "Rollback failed", message: e instanceof ApiError ? e.message : "Nothing was changed.", tone: "danger" });
        } finally {
            setBusy(null);
        }
    };

    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-h5 text-black dark:text-white">Safety net: master rollback</h2>
                    <p className="mt-1 max-w-xl text-caption-2 text-grey">
                        Compressed snapshots of all content and media, taken daily (when something changed), before any bulk delete and on demand, kept for 2 days. Roll the workspace back to one in a single step. Only Super Admins see this.
                    </p>
                </div>
                <button type="button" onClick={snapshot} disabled={!!busy} className="btn-secondary h-9 px-3.5 text-caption-1 disabled:opacity-60">
                    {busy === "new" ? "Taking snapshot…" : "Take snapshot now"}
                </button>
            </div>
            {list === null ? (
                <p className="py-6 text-center text-caption-1 text-grey">Loading…</p>
            ) : list.length === 0 ? (
                <p className="py-6 text-center text-caption-1 text-grey">No snapshots yet. The first daily one is taken within the hour.</p>
            ) : (
                <ul className="mt-4 flex flex-col">
                    {list.map((s, i) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-grey-light/60 py-2.5 last:border-b-0 dark:border-grey-light/5">
                            <div className="min-w-0 grow">
                                <div className="text-body-sm text-black dark:text-white" suppressHydrationWarning>
                                    {new Date(s.createdAt).toLocaleString()} <span className="text-caption-2 text-grey">· {KIND_LABEL[s.kind] ?? s.kind}{i === 0 ? " · newest" : ""}</span>
                                </div>
                                <div className="text-caption-2 text-grey">
                                    {s.counts.entries} entries · {s.counts.types} types · {s.counts.media} files · {size(s.sizeBytes)}
                                    {s.createdBy ? ` · ${s.createdBy}` : ""}
                                    {s.note ? ` · ${s.note}` : ""}
                                </div>
                            </div>
                            <a href={`${API_BASE}/backups/${s.id}/download`} className="btn-secondary h-9 px-3 text-caption-1">Download</a>
                            <button type="button" onClick={() => void rollback(s)} disabled={!!busy} className="btn-danger btn-md disabled:opacity-60">
                                {busy === s.id ? "Rolling back…" : "Roll back to this"}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

export default SafetyNetCard;
