"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import WhiteLabelCard from "@/templates/settings/WhiteLabelCard";
import ApprovalsCard from "@/templates/settings/ApprovalsCard";
import { api, ApiError } from "@/lib/api";
import { clearWorkspaceCache, type Workspace } from "@/lib/useWorkspace";
import { confirm } from "@/components/providers/ConfirmProvider";
import { cn } from "@/lib/cn";

/**
 * System — workspace identity, the frontend preview URL, data export, and the
 * destructive workspace actions. Integrations live under Settings → Integrations.
 */
const System = () => {
    const [name, setName] = useState("");
    const [previewUrl, setPreviewUrl] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        let off = false;
        api<Workspace>("/workspace")
            .then((w) => {
                if (off) return;
                setName(w.name);
                setPreviewUrl(w.previewUrl ?? "");
            })
            .catch(() => {});
        return () => {
            off = true;
        };
    }, []);

    const save = async () => {
        setSaving(true);
        setMsg(null);
        try {
            await api("/workspace", { method: "PATCH", body: JSON.stringify({ name: name.trim(), previewUrl: previewUrl.trim() }) });
            clearWorkspaceCache();
            setMsg({ ok: true, text: "Saved" });
        } catch (e) {
            setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Could not save." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <UpdatesCard />
            <BackupsCard />
            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-5">Workspace</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Workspace name">
                        <input value={name} onChange={(e) => setName(e.target.value)} className="flow-input" />
                    </Field>
                    <Field label="Live preview URL">
                        <input
                            value={previewUrl}
                            onChange={(e) => setPreviewUrl(e.target.value)}
                            placeholder="https://yoursite.com/preview?slug={slug}"
                            className="flow-input"
                        />
                    </Field>
                </div>
                <p className="mt-2.5 max-w-[44rem] text-caption-2 leading-relaxed text-grey">
                    Where the editor&apos;s <strong className="font-semibold text-black dark:text-white">Preview</strong> opens your
                    real site with the draft injected. Use{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{slug}"}</code>,{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{id}"}</code>,{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{type}"}</code> or{" "}
                    <code className="rounded bg-lavender-mist px-1 py-0.5 text-[0.6875rem] text-primary dark:bg-dark-3 dark:text-lilac">{"{locale}"}</code>{" "}
                    placeholders. Leave empty to preview rendered content only. Your frontend reads the draft via the public API with a
                    Preview token (Settings → Developers).
                </p>
                <button
                    type="button"
                    onClick={() => setPreviewUrl(`${window.location.origin}/preview/site-demo?id={id}`)}
                    className="mt-2 text-caption-2 font-semibold text-primary transition-opacity hover:opacity-70"
                >
                    Use the bundled example frontend →
                </button>
                <div className="mt-5 flex items-center justify-end gap-3">
                    {msg && <span className={`text-body-sm ${msg.ok ? "text-success" : "text-error"}`}>{msg.text}</span>}
                    <button type="button" onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </Card>

            <ApprovalsCard />

            <WhiteLabelCard />

            <Card>
                <h2 className="text-h5 text-black dark:text-white mb-1">Data</h2>
                <p className="text-caption-2 text-grey mb-4">Export all workspace content and media.</p>
                <button type="button" className="btn-secondary">
                    <Icon className="w-5 h-5 fill-primary dark:fill-lilac" name="download" />
                    Export workspace
                </button>
            </Card>

            <Card className="!border !border-error/20">
                <h2 className="text-h5 text-error mb-1">Danger zone</h2>
                <p className="text-caption-2 text-grey mb-4">
                    Permanently delete this workspace and all its content.
                </p>
                <button
                    type="button"
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-error/10 text-error font-bold transition-colors hover:bg-error/20"
                >
                    <Icon className="w-5 h-5 fill-error" name="trash" />
                    Delete workspace
                </button>
            </Card>
        </div>
    );
};

type UpdatesInfo = {
    current: string;
    latest: string | null;
    updateAvailable: boolean;
    notes: string | null;
    releaseUrl: string | null;
    deployment: "compose" | "aio" | "unknown";
    checkedAt: string;
    error?: string;
};

type UpgradeStatus = { status: string; step?: string; error?: string | null; toVersion?: string | null; finishedAt?: string | null; reconnecting?: boolean; backupId?: string | null };

const UPGRADE_STEPS: { key: string; label: string }[] = [
    { key: "backup", label: "Backing up" },
    { key: "download", label: "Downloading" },
    { key: "migrate", label: "Updating database" },
    { key: "verify", label: "Starting & verifying" },
];

const UpgradeProgress = ({ p, onRestore, restoring }: { p: UpgradeStatus; onRestore?: (id: string) => void; restoring?: boolean }) => {
    const idx = UPGRADE_STEPS.findIndex((s) => s.key === p.step);
    const done = p.status === "success";
    const rolledBack = p.status === "rolled_back";
    const failed = p.status === "failed";
    const active = p.status === "running" || p.status === "rolling_back";
    return (
        <div className="mt-3 rounded-lg bg-lavender-mist/60 px-4 py-4 dark:bg-dark-3/50">
            {active ? (
                <>
                    <div className="mb-3 flex items-center gap-2 text-body-sm font-semibold text-black dark:text-white">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-grey/30 border-t-primary" />
                        {p.status === "rolling_back" ? "Upgrade failed — rolling back…" : "Upgrading…"}
                        {p.reconnecting && <span className="text-caption-2 font-normal text-grey">reconnecting…</span>}
                    </div>
                    <ol className="flex flex-col gap-1.5">
                        {UPGRADE_STEPS.map((s, i) => {
                            const state = idx < 0 ? "pending" : i < idx ? "done" : i === idx ? "active" : "pending";
                            return (
                                <li key={s.key} className="flex items-center gap-2 text-caption-1">
                                    <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[0.6rem]", state === "done" ? "bg-success/20 text-success" : state === "active" ? "bg-primary/20 text-primary dark:text-lilac" : "bg-grey-light text-grey dark:bg-dark-1")}>
                                        {state === "done" ? "✓" : i + 1}
                                    </span>
                                    <span className={state === "pending" ? "text-grey" : "text-black dark:text-white"}>{s.label}</span>
                                </li>
                            );
                        })}
                    </ol>
                    <p className="mt-3 text-caption-2 text-grey">Your site briefly restarts during this step. Keep this tab open.</p>
                </>
            ) : (
                <div className="flex items-start gap-2.5">
                    <Icon className={cn("h-5 w-5 shrink-0", done ? "fill-success" : failed ? "fill-error" : "fill-warning")} name={done ? "check" : "info"} />
                    <div>
                        <p className={cn("text-body-sm font-semibold", done ? "text-success" : failed ? "text-error" : "text-black dark:text-white")}>
                            {done ? `Upgraded to v${p.toVersion} ✓` : rolledBack ? "Upgrade failed — rolled back, your site is safe" : "Upgrade failed"}
                        </p>
                        {p.error && <p className="mt-0.5 text-caption-2 text-grey">{p.error}</p>}
                        {failed && p.backupId && onRestore && (
                            <button type="button" onClick={() => onRestore(p.backupId!)} disabled={restoring} className="btn-secondary btn-md mt-2.5 disabled:opacity-60">
                                <Icon className={`h-4 w-4 fill-current ${restoring ? "animate-spin" : ""}`} name="refresh" />
                                {restoring ? "Restoring…" : "Restore the pre-upgrade backup"}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

/** Self-host version, update availability, and the one-click upgrade (Super-Admin,
 *  compose self-host). The API restarts mid-upgrade, so progress is polled and
 *  tolerant of the gap. */
const UpdatesCard = () => {
    const [info, setInfo] = useState<(UpdatesInfo & { updaterAvailable?: boolean }) | null>(null);
    const [checking, setChecking] = useState(false);
    const [progress, setProgress] = useState<UpgradeStatus | null>(null);
    const [restoring, setRestoring] = useState(false);

    const load = (force?: boolean) => {
        setChecking(true);
        api<UpdatesInfo & { updaterAvailable?: boolean }>(`/system/updates${force ? "?force=1" : ""}`)
            .then(setInfo)
            .catch(() => undefined)
            .finally(() => setChecking(false));
    };

    const poll = () => {
        let tries = 0;
        const tick = async () => {
            try {
                const s = await api<UpgradeStatus>("/system/upgrade/status");
                setProgress(s);
                if (["success", "rolled_back", "failed"].includes(s.status)) {
                    if (s.status === "success") load(true);
                    return;
                }
            } catch {
                setProgress((prev) => ({ ...(prev ?? { status: "running" }), reconnecting: true }));
            }
            if (++tries < 200) setTimeout(tick, 3000);
        };
        setTimeout(tick, 2000);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
        // Resume showing an upgrade that's already running (e.g. a page reload).
        api<UpgradeStatus>("/system/upgrade/status")
            .then((s) => {
                if (s && ["running", "rolling_back"].includes(s.status)) {
                    setProgress(s);
                    poll();
                }
            })
            .catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startUpgrade = async () => {
        if (!info?.latest) return;
        if (
            !(await confirm({
                title: `Upgrade to v${info.latest}?`,
                message: "A full backup is taken first, and your site will briefly restart. If the new version fails to start, it rolls back automatically.",
                confirmLabel: `Upgrade to v${info.latest}`,
            }))
        )
            return;
        setProgress({ status: "running", step: "starting" });
        try {
            await api("/system/upgrade", { method: "POST", body: JSON.stringify({ toVersion: info.latest }) });
        } catch {
            /* the api may already be restarting — poll anyway */
        }
        poll();
    };

    const restoreBackup = async (backupId: string) => {
        if (
            !(await confirm({
                title: "Restore the pre-upgrade backup?",
                message: "This replaces the database and media with the snapshot taken just before the upgrade. Your site will briefly restart.",
                confirmLabel: "Restore",
                tone: "danger",
            }))
        )
            return;
        setRestoring(true);
        try {
            await api(`/system/restore/${backupId}`, { method: "POST", body: JSON.stringify({ restoreEnv: false }) });
            setProgress((prev) => (prev ? { ...prev, error: "Restored the pre-upgrade backup. Reload to continue." } : prev));
        } catch {
            /* surfaced via the existing error line */
        } finally {
            setRestoring(false);
        }
    };

    const canUpgrade = !!info?.updaterAvailable && info?.deployment === "compose" && !!info?.updateAvailable;
    const upgrading = !!progress && ["running", "rolling_back"].includes(progress.status);

    return (
        <Card>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-h5 text-black dark:text-white">Updates</h2>
                {info && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-lavender-mist px-2.5 py-1 text-caption-2 font-semibold text-primary dark:bg-dark-3 dark:text-lilac">
                        <Icon className="h-3.5 w-3.5 fill-current" name="grid" />
                        v{info.current}
                    </span>
                )}
            </div>

            {progress ? (
                <UpgradeProgress p={progress} onRestore={restoreBackup} restoring={restoring} />
            ) : info?.updateAvailable ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-primary/10 px-4 py-3">
                    <Icon className="h-5 w-5 shrink-0 fill-primary dark:fill-lilac" name="download" />
                    <div className="min-w-0 grow">
                        <p className="text-body-sm font-semibold text-black dark:text-white">Version {info.latest} is available</p>
                        {info.releaseUrl && (
                            <a href={info.releaseUrl} target="_blank" rel="noopener noreferrer" className="text-caption-2 font-semibold text-primary underline dark:text-lilac">
                                Release notes →
                            </a>
                        )}
                    </div>
                    {canUpgrade ? (
                        <button type="button" onClick={startUpgrade} className="btn-primary btn-md">
                            <Icon className="h-4 w-4 fill-white" name="download" />
                            Upgrade to v{info.latest}
                        </button>
                    ) : info.deployment === "aio" ? (
                        <span className="text-caption-2 text-grey">Managed by your platform</span>
                    ) : null}
                </div>
            ) : (
                <p className="mt-2 text-caption-2 text-grey">
                    {info?.error ? info.error : info?.latest ? "You're running the latest version." : "No published releases to compare against yet."}
                </p>
            )}

            {info?.deployment === "aio" && (
                <p className="mt-3 text-caption-2 text-grey">
                    Your hosting platform manages updates for this deployment. Redeploy from your platform&apos;s dashboard to move to a newer version.
                </p>
            )}

            {!upgrading && (
                <div className="mt-4 flex items-center gap-3">
                    <button type="button" onClick={() => load(true)} disabled={checking} className="btn-secondary btn-md disabled:opacity-60">
                        <Icon className={`h-4 w-4 fill-current ${checking ? "animate-spin" : ""}`} name="refresh" />
                        {checking ? "Checking…" : "Check for updates"}
                    </button>
                    {info && <span className="text-caption-2 text-grey">Checked {new Date(info.checkedAt).toLocaleTimeString()}</span>}
                </div>
            )}
        </Card>
    );
};

type BackupItem = { id: string; createdAt: string; version: string | null; dbBytes: number; mediaBytes: number; totalBytes: number };

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Full backups (database + media + secrets) via the updater sidecar. Hidden on
 *  deployments without the updater (managed PaaS / dev). */
const BackupsCard = () => {
    const [available, setAvailable] = useState<boolean | null>(null);
    const [list, setList] = useState<BackupItem[]>([]);
    const [busy, setBusy] = useState(false);
    const [restoring, setRestoring] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    const refresh = () => api<BackupItem[]>("/system/backups").then(setList).catch(() => undefined);
    useEffect(() => {
        api<{ updaterAvailable: boolean }>("/system/version")
            .then((v) => {
                setAvailable(v.updaterAvailable);
                if (v.updaterAvailable) void refresh();
            })
            .catch(() => setAvailable(false));
    }, []);

    if (available === false) return null;

    const create = async () => {
        setBusy(true);
        setErr(null);
        try {
            await api("/system/backups", { method: "POST" });
            await refresh();
        } catch (e) {
            setErr(e instanceof ApiError ? e.message : "Backup failed.");
        } finally {
            setBusy(false);
        }
    };
    const remove = async (id: string) => {
        if (!(await confirm({ title: "Delete this backup?", message: "This can't be undone.", confirmLabel: "Delete", tone: "danger" }))) return;
        await api(`/system/backups/${id}`, { method: "DELETE" }).catch(() => undefined);
        void refresh();
    };
    const restore = async (b: BackupItem) => {
        const when = new Date(b.createdAt).toLocaleString();
        if (
            !(await confirm({
                title: `Restore the backup from ${when}?`,
                message: "This REPLACES your current database and media with that snapshot. Anything created since then will be lost. This can't be undone, so take a fresh backup first if you're unsure.",
                confirmLabel: "Restore",
                tone: "danger",
            }))
        )
            return;
        setRestoring(b.id);
        setErr(null);
        setNote(null);
        try {
            await api(`/system/restore/${b.id}`, { method: "POST", body: JSON.stringify({ restoreEnv: false }) });
            setNote("Restored. Reload the page to see the restored content.");
        } catch (e) {
            setErr(e instanceof ApiError ? e.message : "Restore failed.");
        } finally {
            setRestoring(null);
        }
    };

    return (
        <Card>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-h5 text-black dark:text-white">Backups</h2>
                <button type="button" onClick={create} disabled={busy} className="btn-secondary btn-md disabled:opacity-60">
                    <Icon className={`h-4 w-4 fill-current ${busy ? "animate-spin" : ""}`} name={busy ? "refresh" : "download"} />
                    {busy ? "Backing up…" : "Create backup"}
                </button>
            </div>
            <p className="mb-4 max-w-[44rem] text-caption-2 leading-relaxed text-grey">
                A full snapshot of your database, uploaded media and secrets. Stored on this server; downloaded copies contain your{" "}
                <strong className="font-semibold text-black dark:text-white">secrets</strong> — keep them private. A backup is taken automatically before every upgrade.
            </p>
            {err && <p className="mb-3 text-caption-1 text-error">{err}</p>}
            {note && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-success/10 px-3 py-2 text-caption-1 text-success">
                    <span>{note}</span>
                    <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">
                        Reload
                    </button>
                </div>
            )}
            {list.length === 0 ? (
                <p className="text-caption-2 text-grey">No backups yet.</p>
            ) : (
                <ul className="flex flex-col divide-y divide-grey-light dark:divide-grey-light/10">
                    {list.map((b) => (
                        <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
                            <div className="min-w-0 grow">
                                <div className="text-body-sm text-black dark:text-white">{new Date(b.createdAt).toLocaleString()}</div>
                                <div className="text-caption-2 text-grey">
                                    {fmtBytes(b.totalBytes)}
                                    {b.version ? ` · v${b.version}` : ""}
                                </div>
                            </div>
                            <button type="button" onClick={() => restore(b)} disabled={!!restoring} className="btn-ghost btn-md border border-grey-light disabled:opacity-60 dark:border-grey-light/10">
                                <Icon className={`h-4 w-4 fill-current ${restoring === b.id ? "animate-spin" : ""}`} name="refresh" />
                                {restoring === b.id ? "Restoring…" : "Restore"}
                            </button>
                            <a href={`/api/system/backups/${b.id}/download`} className="btn-ghost btn-md border border-grey-light dark:border-grey-light/10">
                                <Icon className="h-4 w-4 fill-current" name="download" />
                                Download
                            </a>
                            <button type="button" onClick={() => remove(b.id)} aria-label="Delete backup" className="flex h-9 w-9 items-center justify-center rounded-lg text-grey transition-colors hover:bg-error/10 hover:text-error">
                                <Icon className="h-4 w-4 fill-current" name="trash" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-caption-1 text-grey">{label}</span>
        {children}
    </label>
);

export default System;
