"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export type UpgradeStatus = {
    status: string;
    step?: string;
    error?: string | null;
    toVersion?: string | null;
    finishedAt?: string | null;
    reconnecting?: boolean;
    backupId?: string | null;
};

type Ctx = {
    progress: UpgradeStatus | null;
    restoring: boolean;
    startUpgrade: (toVersion: string) => Promise<void>;
};

const UpgradeContext = createContext<Ctx | null>(null);

export const useUpgrade = () => {
    const c = useContext(UpgradeContext);
    if (!c) throw new Error("useUpgrade must be used within UpgradeProvider");
    return c;
};

const UPGRADE_STEPS: { key: string; label: string }[] = [
    { key: "backup", label: "Backing up" },
    { key: "download", label: "Downloading" },
    { key: "migrate", label: "Updating database" },
    { key: "verify", label: "Starting & verifying" },
];

/**
 * App-wide upgrade lock. The upgrade restarts the server, so once it starts the
 * whole studio must freeze (no navigating mid-upgrade) until it finishes and the
 * page hard-reloads onto the new build. Living at the provider root (not inside
 * the System tab) keeps the blocking overlay up across route changes, and lets a
 * reload mid-upgrade resume showing progress.
 */
export function UpgradeProvider({ children }: { children: React.ReactNode }) {
    const [progress, setProgress] = useState<UpgradeStatus | null>(null);
    const [restoring, setRestoring] = useState(false);
    const polling = useRef(false);

    const poll = useCallback(() => {
        if (polling.current) return;
        polling.current = true;
        let tries = 0;
        const tick = async () => {
            try {
                const s = await api<UpgradeStatus>("/system/upgrade/status");
                setProgress(s);
                if (["success", "rolled_back", "failed"].includes(s.status)) {
                    polling.current = false;
                    // Hard-reload on success so the browser fetches the new build's
                    // studio bundle + API (a soft refetch would keep stale assets).
                    if (s.status === "success") setTimeout(() => window.location.reload(), 2500);
                    return;
                }
            } catch {
                // The API restarts mid-upgrade; tolerate the gap.
                setProgress((prev) => ({ ...(prev ?? { status: "running" }), reconnecting: true }));
            }
            if (++tries < 300) setTimeout(tick, 3000);
            else polling.current = false;
        };
        setTimeout(tick, 2000);
    }, []);

    // Resume an already-running upgrade (e.g. the tab was reloaded mid-upgrade).
    useEffect(() => {
        api<UpgradeStatus>("/system/upgrade/status")
            .then((s) => {
                if (s && ["running", "rolling_back"].includes(s.status)) {
                    setProgress(s);
                    poll();
                }
            })
            .catch(() => undefined);
    }, [poll]);

    // Freeze background scroll while the overlay is up.
    useEffect(() => {
        if (!progress) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [progress]);

    const startUpgrade = useCallback(
        async (toVersion: string) => {
            setProgress({ status: "running", step: "starting", toVersion });
            try {
                await api("/system/upgrade", { method: "POST", body: JSON.stringify({ toVersion }) });
            } catch {
                /* the api may already be restarting — poll anyway */
            }
            poll();
        },
        [poll],
    );

    const restoreBackup = useCallback(async (backupId: string) => {
        setRestoring(true);
        try {
            await api(`/system/restore/${backupId}`, { method: "POST", body: JSON.stringify({ restoreEnv: false }) });
            setProgress((prev) => (prev ? { ...prev, error: "Restored the pre-upgrade backup. Reload to continue." } : prev));
        } catch {
            /* surfaced on the existing error line */
        } finally {
            setRestoring(false);
        }
    }, []);

    return (
        <UpgradeContext.Provider value={{ progress, restoring, startUpgrade }}>
            {children}
            {progress && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" />
                    <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.22)] dark:bg-dark-1">
                        <h3 className="text-title font-semibold text-black dark:text-white">Upgrading FlowCMS</h3>
                        <UpgradeProgress p={progress} onRestore={restoreBackup} restoring={restoring} />
                        {progress.status === "success" && <p className="mt-3 text-caption-2 text-grey">Reloading to the new version…</p>}
                        {(progress.status === "running" || progress.status === "rolling_back") && (
                            <p className="mt-3 text-caption-2 text-grey">The app is locked until the upgrade finishes. Keep this tab open.</p>
                        )}
                        {(progress.status === "failed" || progress.status === "rolled_back") && (
                            <button type="button" onClick={() => setProgress(null)} className="btn-secondary btn-md mt-4 w-full">
                                Close
                            </button>
                        )}
                    </div>
                </div>
            )}
        </UpgradeContext.Provider>
    );
}

/** The step list / outcome card, shown inside the global overlay. */
const UpgradeProgress = ({ p, onRestore, restoring }: { p: UpgradeStatus; onRestore: (id: string) => void; restoring: boolean }) => {
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
                        {p.status === "rolling_back" ? "Upgrade failed, rolling back…" : "Upgrading…"}
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
                    <p className="mt-3 text-caption-2 text-grey">Your site briefly restarts during this step.</p>
                </>
            ) : (
                <div className="flex items-start gap-2.5">
                    <Icon className={cn("h-5 w-5 shrink-0", done ? "fill-success" : failed ? "fill-error" : "fill-warning")} name={done ? "check" : "info"} />
                    <div>
                        <p className={cn("text-body-sm font-semibold", done ? "text-success" : failed ? "text-error" : "text-black dark:text-white")}>
                            {done ? `Upgraded to v${p.toVersion} ✓` : rolledBack ? "Upgrade failed, rolled back; your site is safe" : "Upgrade failed"}
                        </p>
                        {p.error && <p className="mt-0.5 text-caption-2 text-grey">{p.error}</p>}
                        {failed && p.backupId && (
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
