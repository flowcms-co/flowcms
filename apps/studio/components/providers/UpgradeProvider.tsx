"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { api } from "@/lib/api";
import Icon from "@/components/ui/Icon";
import { useBrand } from "@/lib/useBrand";
import { cn } from "@/lib/cn";

gsap.registerPlugin(useGSAP);

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

const UPGRADE_STEPS: { key: string; label: string; desc: string }[] = [
    { key: "starting", label: "Preparing", desc: "Setting up your environment" },
    { key: "backup", label: "Backing up", desc: "Creating a safe backup" },
    { key: "download", label: "Downloading", desc: "Fetching the latest version" },
    { key: "migrate", label: "Updating database", desc: "Applying database changes" },
    { key: "verify", label: "Starting & verifying", desc: "Restarting services and running checks" },
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
            {progress && <UpgradeModal p={progress} onRestore={restoreBackup} restoring={restoring} onClose={() => setProgress(null)} />}
        </UpgradeContext.Provider>
    );
}

const STATUS: Record<string, { label: string; cls: string }> = {
    done: { label: "Completed", cls: "bg-success/15 text-success" },
    active: { label: "In progress", cls: "bg-primary/15 text-primary dark:text-lilac" },
    pending: { label: "Pending", cls: "bg-grey-light/70 text-grey dark:bg-dark-3 dark:text-grey" },
};

const StatusBadge = ({ state }: { state: "done" | "active" | "pending" }) => (
    <span className={cn("mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold", STATUS[state].cls)}>{STATUS[state].label}</span>
);

/**
 * The full-screen upgrade overlay — a live step tracker shown while the server
 * rebuilds and restarts onto the new version. It mounts only while an upgrade is
 * in flight (or just finished), so the GSAP entrance plays exactly once. A soft
 * halo pulses behind whichever step is currently running.
 */
const UpgradeModal = ({ p, onRestore, restoring, onClose }: { p: UpgradeStatus; onRestore: (id: string) => void; restoring: boolean; onClose: () => void }) => {
    const root = useRef<HTMLDivElement>(null);
    const brand = useBrand();
    const productName = brand.name ?? "FlowCMS";

    const done = p.status === "success";
    const failed = p.status === "failed";
    const rolledBack = p.status === "rolled_back";
    const active = p.status === "running" || p.status === "rolling_back";
    const terminal = done || failed || rolledBack;

    // `success` lights every step; a known step lights that row and completes the
    // ones before it. An unknown step (-1) leaves the first row as the active one.
    const idx = done ? UPGRADE_STEPS.length : Math.max(0, UPGRADE_STEPS.findIndex((s) => s.key === p.step));

    // One-shot entrance: backdrop fade, card settle, header + step stagger, footer.
    useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            gsap.timeline({ defaults: { ease: "power3.out" } })
                .from(".u-backdrop", { autoAlpha: 0, duration: 0.3 }, 0)
                .from(".u-card", { autoAlpha: 0, scale: 0.96, y: 14, duration: 0.45, ease: "back.out(1.5)" }, 0.04)
                .from(".u-head", { autoAlpha: 0, y: 8, duration: 0.4 }, 0.16)
                .from(".u-row", { autoAlpha: 0, y: 10, duration: 0.4, stagger: 0.07 }, 0.2)
                .from(".u-foot", { autoAlpha: 0, y: 10, duration: 0.4 }, "-=0.12");
        },
        { scope: root, dependencies: [] },
    );

    // Pulsing halo behind the live step (re-targets as the upgrade advances).
    useGSAP(
        () => {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
            const halo = root.current?.querySelector<HTMLElement>(".u-halo");
            if (!halo) return;
            gsap.fromTo(halo, { scale: 0.85, opacity: 0.55 }, { scale: 1.9, opacity: 0, duration: 1.5, ease: "power2.out", repeat: -1 });
        },
        { scope: root, dependencies: [idx, active] },
    );

    return (
        <div ref={root} role="dialog" aria-modal="true" aria-label={`Upgrading ${productName}`} className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="u-backdrop absolute inset-0 bg-ink/60 backdrop-blur-sm" />
            <div className="u-card relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-[0_1.5rem_3.5rem_rgba(26,26,46,0.28)] dark:bg-dark-1 sm:p-7">
                {/* Header */}
                <div className="u-head flex items-start gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-lavender-mist dark:bg-primary/15">
                        <Icon name="rocket" className="h-6 w-6 fill-primary dark:fill-lilac" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-title font-semibold text-black dark:text-white">Upgrading {productName}</h3>
                        <p className="mt-0.5 text-caption-1 leading-snug text-grey">This may take a few minutes. You can keep this tab open.</p>
                    </div>
                    {terminal && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-grey transition-colors hover:bg-grey-light/60 hover:text-black dark:hover:bg-dark-3 dark:hover:text-white"
                        >
                            <Icon name="close" className="h-4 w-4 fill-current" />
                        </button>
                    )}
                </div>

                {terminal && !done ? (
                    /* failed / rolled-back outcome */
                    <div className="u-row mt-6 rounded-2xl bg-error/[0.08] px-4 py-4 dark:bg-error/[0.12]">
                        <div className="flex items-start gap-3">
                            <Icon name="info" className="h-5 w-5 shrink-0 fill-error" />
                            <div className="min-w-0">
                                <p className="text-body-sm font-semibold text-error">{rolledBack ? "Upgrade failed, rolled back; your site is safe" : "Upgrade failed"}</p>
                                {p.error && <p className="mt-0.5 text-caption-2 text-grey">{p.error}</p>}
                                {p.backupId && (
                                    <button type="button" onClick={() => onRestore(p.backupId!)} disabled={restoring} className="btn-secondary btn-md mt-3 disabled:opacity-60">
                                        <Icon className={`h-4 w-4 fill-current ${restoring ? "animate-spin" : ""}`} name="refresh" />
                                        {restoring ? "Restoring…" : "Restore the pre-upgrade backup"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Step tracker */}
                        <ol className="mt-6 flex flex-col">
                            {UPGRADE_STEPS.map((s, i) => {
                                const state = i < idx ? "done" : i === idx ? "active" : "pending";
                                const isLast = i === UPGRADE_STEPS.length - 1;
                                return (
                                    <li key={s.key} className="u-row relative flex gap-3.5 pb-5 last:pb-0">
                                        {!isLast && (
                                            <span className={cn("absolute bottom-0 left-[1.0625rem] top-10 w-0.5 rounded-full", state === "done" ? "bg-success/40" : "bg-grey-light dark:bg-dark-3")} />
                                        )}
                                        {/* Status indicator */}
                                        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                                            {state === "active" && <span className="u-halo absolute inset-0 rounded-full bg-primary/30" />}
                                            <span
                                                className={cn(
                                                    "relative flex h-9 w-9 items-center justify-center rounded-full text-caption-1 font-semibold",
                                                    state === "done"
                                                        ? "bg-success text-white"
                                                        : state === "active"
                                                          ? "bg-white text-primary ring-2 ring-primary/30 dark:bg-dark-1 dark:text-lilac"
                                                          : "bg-grey-light/70 text-grey dark:bg-dark-3",
                                                )}
                                            >
                                                {state === "done" ? (
                                                    <Icon name="check" className="h-5 w-5 fill-white" />
                                                ) : state === "active" ? (
                                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                                                ) : (
                                                    i + 1
                                                )}
                                            </span>
                                        </span>
                                        {/* Label + status badge */}
                                        <div className="flex flex-1 items-start justify-between gap-3 pt-0.5">
                                            <div className="min-w-0">
                                                <p className={cn("text-body-sm font-semibold", state === "pending" ? "text-grey" : "text-black dark:text-white")}>{s.label}</p>
                                                <p className="mt-0.5 text-caption-2 text-grey">{s.desc}</p>
                                            </div>
                                            <StatusBadge state={state} />
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>

                        {done ? (
                            <div className="u-foot mt-5 flex items-center gap-2.5 rounded-2xl bg-success/10 px-4 py-3.5">
                                <Icon name="check" className="h-5 w-5 shrink-0 fill-success" />
                                <p className="text-body-sm font-semibold text-success">Upgraded to v{p.toVersion} · reloading…</p>
                            </div>
                        ) : (
                            <div className="u-foot mt-6 rounded-2xl bg-lavender-mist/60 px-4 py-3.5 dark:bg-dark-3/40">
                                <div className="flex items-start gap-3">
                                    <Icon name="lock" className="h-5 w-5 shrink-0 fill-primary dark:fill-lilac" />
                                    <div>
                                        <p className="text-caption-1 font-semibold text-black dark:text-white">The app is locked during the upgrade</p>
                                        <p className="text-caption-2 text-grey">This ensures a safe and reliable update process.</p>
                                    </div>
                                </div>
                                <div className="my-3 h-px bg-grey-light/70 dark:bg-dark-1" />
                                <div className="flex items-start gap-3">
                                    <Icon name="info" className="h-5 w-5 shrink-0 fill-grey" />
                                    <div>
                                        <p className="text-caption-1 font-semibold text-black dark:text-white">Please don&apos;t refresh or close the page</p>
                                        <p className="text-caption-2 text-grey">till the upgrade finishes{p.reconnecting ? " · reconnecting…" : "."}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
