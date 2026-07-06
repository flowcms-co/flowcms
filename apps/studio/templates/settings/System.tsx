"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import WhiteLabelCard from "@/templates/settings/WhiteLabelCard";
import ApprovalsCard from "@/templates/settings/ApprovalsCard";
import { api, ApiError } from "@/lib/api";
import { clearWorkspaceCache, type Workspace } from "@/lib/useWorkspace";
import { confirm } from "@/components/providers/ConfirmProvider";
import { useUpgrade } from "@/components/providers/UpgradeProvider";
import { helpUrl, GUIDES } from "@/lib/help";

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
    platform: "railway" | "render" | null;
    checkedAt: string;
    error?: string;
};

/** Human label for the detected managed host (falls back to the generic wording). */
const platformLabel = (p: UpdatesInfo["platform"]) => (p === "railway" ? "Railway" : p === "render" ? "Render" : "your platform");

type PlatformUpdater = { platform: "railway" | "render" | null; configured: boolean; reason: string | null };

/** Self-host version, update availability, and the one-click upgrade (Super-Admin,
 *  compose self-host). The upgrade flow + its app-wide lock live in UpgradeProvider. */
const UpdatesCard = () => {
    const [info, setInfo] = useState<(UpdatesInfo & { updaterAvailable?: boolean; platformUpdater?: PlatformUpdater | null }) | null>(null);
    const [checking, setChecking] = useState(false);
    const [secret, setSecret] = useState("");
    const [savingSecret, setSavingSecret] = useState(false);
    const [redeploying, setRedeploying] = useState(false);
    const [redeployMsg, setRedeployMsg] = useState<string | null>(null);
    // The upgrade itself is owned by the app-wide UpgradeProvider, so its progress
    // overlay locks the whole studio (not just this card) until it finishes.
    const { progress, startUpgrade } = useUpgrade();

    const load = (force?: boolean) => {
        setChecking(true);
        api<UpdatesInfo & { updaterAvailable?: boolean; platformUpdater?: PlatformUpdater | null }>(`/system/updates${force ? "?force=1" : ""}`)
            .then(setInfo)
            .catch(() => undefined)
            .finally(() => setChecking(false));
    };

    const savePlatformSecret = async () => {
        if (!secret.trim()) return;
        setSavingSecret(true);
        try {
            await api("/system/platform-updater", { method: "PUT", body: JSON.stringify({ secret }) });
            setSecret("");
            load();
        } catch (e) {
            setRedeployMsg(e instanceof Error ? e.message : "Couldn't save the credential.");
        } finally {
            setSavingSecret(false);
        }
    };

    const disconnectPlatform = async () => {
        await api("/system/platform-updater", { method: "DELETE" }).catch(() => undefined);
        load();
    };

    /** One-click update on a managed host: the platform pulls the newest image and
     *  restarts; we poll the version and reload the studio when the new one is live. */
    const doPlatformUpdate = async () => {
        if (!info?.latest) return;
        if (
            !(await confirm({
                title: `Update to v${info.latest}?`,
                message: `${platformLabel(info.platform)} pulls the newest image and restarts the service. The studio is briefly unavailable and reloads automatically on the new version; database migrations apply on boot.`,
                confirmLabel: `Update to v${info.latest}`,
            }))
        )
            return;
        setRedeploying(true);
        setRedeployMsg(`Asking ${platformLabel(info.platform)} to redeploy…`);
        try {
            await api("/system/platform-redeploy", { method: "POST", body: JSON.stringify({}) });
        } catch (e) {
            setRedeploying(false);
            setRedeployMsg(e instanceof Error ? e.message : "The platform rejected the redeploy.");
            return;
        }
        setRedeployMsg(`${platformLabel(info.platform)} is deploying the new version — this page reloads automatically when it's live.`);
        const startedVersion = info.current;
        const deadline = Date.now() + 8 * 60 * 1000;
        const tick = async () => {
            try {
                const v = await api<{ version: string }>("/system/version");
                if (v.version && v.version !== startedVersion) {
                    window.location.reload();
                    return;
                }
            } catch {
                /* the service is restarting — keep polling */
            }
            if (Date.now() < deadline) setTimeout(tick, 6000);
            else {
                setRedeploying(false);
                setRedeployMsg("Still deploying — refresh this page in a minute to see the new version.");
            }
        };
        setTimeout(tick, 10000);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, []);

    const doUpgrade = async () => {
        if (!info?.latest) return;
        if (
            !(await confirm({
                title: `Upgrade to v${info.latest}?`,
                message: "A full backup is taken first and your site briefly restarts. The whole app locks until it finishes; if the new version fails to start, it rolls back automatically.",
                confirmLabel: `Upgrade to v${info.latest}`,
            }))
        )
            return;
        await startUpgrade(info.latest);
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

            {info?.updateAvailable ? (
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
                        <button type="button" onClick={doUpgrade} className="btn-primary btn-md">
                            <Icon className="h-4 w-4 fill-white" name="download" />
                            Upgrade to v{info.latest}
                        </button>
                    ) : info.deployment === "aio" && info.platformUpdater?.configured ? (
                        <button type="button" onClick={doPlatformUpdate} disabled={redeploying} className="btn-primary btn-md disabled:opacity-60">
                            <Icon className={`h-4 w-4 fill-white ${redeploying ? "animate-spin" : ""}`} name="download" />
                            {redeploying ? "Updating…" : `Update to v${info.latest}`}
                        </button>
                    ) : info.deployment === "aio" ? (
                        <span className="text-caption-2 text-grey">Managed by {platformLabel(info.platform)}</span>
                    ) : null}
                </div>
            ) : (
                <p className="mt-2 text-caption-2 text-grey">
                    {info?.error ? info.error : info?.latest ? "You're running the latest version." : "No published releases to compare against yet."}
                </p>
            )}

            {redeployMsg && <p className="mt-2 text-caption-2 font-medium text-primary dark:text-lilac">{redeployMsg}</p>}

            {info?.deployment === "aio" && info.platformUpdater?.configured && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-lavender-mist/60 px-4 py-3 dark:bg-dark-3">
                    <p className="text-caption-2 text-grey">
                        One-click updates are enabled: updating asks {platformLabel(info.platform)} to pull the newest image and restart the service. Migrations apply automatically on boot.
                    </p>
                    <button type="button" onClick={disconnectPlatform} className="text-caption-2 font-semibold text-grey underline hover:text-ink dark:hover:text-white">
                        Disconnect
                    </button>
                </div>
            )}

            {info?.deployment === "aio" && !info.platformUpdater?.configured && (
                <div className="mt-3 rounded-lg bg-lavender-mist/60 px-4 py-3 dark:bg-dark-3">
                    <p className="text-caption-2 text-grey">
                        This deployment is managed by {platformLabel(info.platform)}. Enable one-click updates so new versions install from right here — no dashboard needed:
                        {" "}
                        {info.platform === "railway"
                            ? "paste a Railway API token (Railway → Account Settings → Tokens, or a project token)."
                            : "paste this service's Deploy Hook URL (Render → the service → Settings → Deploy Hook)."}
                    </p>
                    {info.platformUpdater?.reason && <p className="mt-1 text-caption-2 text-grey/80">{info.platformUpdater.reason}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                            type="password"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            placeholder={info.platform === "railway" ? "Railway API token" : "https://api.render.com/deploy/srv-…"}
                            className="h-10 w-full max-w-sm rounded-2xl border border-grey-light bg-white px-4 text-caption-1 text-black outline-none transition-colors placeholder:text-grey focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                            autoComplete="off"
                        />
                        <button type="button" onClick={savePlatformSecret} disabled={savingSecret || !secret.trim()} className="btn-primary btn-md disabled:opacity-60">
                            {savingSecret ? "Saving…" : "Enable one-click updates"}
                        </button>
                    </div>
                    <p className="mt-1.5 text-caption-2 text-grey/70">Stored encrypted, like every other credential. You can disconnect any time.</p>
                    {info.platform === "railway" ? (
                        <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-caption-2 text-grey">
                            <li>Open your project in the Railway dashboard and select the Flow CMS service.</li>
                            <li>Open <span className="font-semibold">Settings → Deploy</span> and trigger <span className="font-semibold">Redeploy</span> (or push to the connected branch) to rebuild the latest image.</li>
                            <li>Railway pulls the new version and restarts the service; database migrations apply automatically on boot.</li>
                        </ol>
                    ) : info.platform === "render" ? (
                        <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-caption-2 text-grey">
                            <li>Open the Flow CMS service in your Render dashboard.</li>
                            <li>Choose <span className="font-semibold">Manual Deploy → Deploy latest commit</span> (or push to the connected branch) to rebuild the image.</li>
                            <li>Render restarts the service; database migrations apply automatically on boot.</li>
                        </ol>
                    ) : null}
                    <a
                        href={helpUrl(GUIDES.updating)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-caption-2 font-semibold text-primary hover:opacity-70 dark:text-lilac"
                    >
                        How to update on {platformLabel(info.platform)} →
                    </a>
                </div>
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
