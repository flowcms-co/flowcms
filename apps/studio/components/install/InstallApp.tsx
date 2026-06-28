"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * In-webapp "Add to Home Screen" flow.
 *
 * iOS Safari gives no programmatic install API, so we detect the platform and
 * show the exact Share → Add to Home Screen steps. Android/desktop Chromium fire
 * `beforeinstallprompt`, which we capture and replay on tap for a one-click
 * install. Once running standalone (launched from the Home Screen) every entry
 * point hides itself.
 */

type Platform = "ios" | "android" | "desktop";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "flowadmin-a2hs-dismissed";

function useInstallState() {
    const [mounted, setMounted] = useState(false);
    const [standalone, setStandalone] = useState(false);
    const [platform, setPlatform] = useState<Platform>("desktop");
    const [canPrompt, setCanPrompt] = useState(false);
    const deferred = useRef<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        // Hydration-safe client-mount detection (intentional setState on mount).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
        const ua = navigator.userAgent;
        const iOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        const android = /android/i.test(ua);
        setPlatform(iOS ? "ios" : android ? "android" : "desktop");

        const nav = navigator as Navigator & { standalone?: boolean };
        const isStandalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
        setStandalone(isStandalone);

        const onPrompt = (e: Event) => {
            e.preventDefault();
            deferred.current = e as BeforeInstallPromptEvent;
            setCanPrompt(true);
        };
        const onInstalled = () => {
            setStandalone(true);
            setCanPrompt(false);
        };
        window.addEventListener("beforeinstallprompt", onPrompt);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onPrompt);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const nativePrompt = useCallback(async () => {
        const ev = deferred.current;
        if (!ev) return false;
        await ev.prompt();
        await ev.userChoice;
        deferred.current = null;
        setCanPrompt(false);
        return true;
    }, []);

    return { mounted, standalone, platform, canPrompt, nativePrompt };
}

/* ── The bottom sheet with platform-specific steps ──────────────────────────── */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-poppins text-caption-1 font-bold text-primary">{n}</span>
            <span className="pt-0.5 text-body-sm text-black dark:text-white">{children}</span>
        </li>
    );
}

function InstallSheet({ platform, onClose }: { platform: Platform; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [onClose]);

    // Portal to <body>: the sheet can be opened from inside the sidebar drawer,
    // which carries a CSS transform — that would otherwise become the containing
    // block for `position: fixed`, trapping the sheet inside the 256px drawer.
    if (typeof document === "undefined") return null;
    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
            <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm" style={{ animation: "fadeIn 150ms ease-out" }} onClick={onClose} />
            <div className="animate-sheet-up pb-safe relative w-full max-w-md rounded-t-3xl bg-white p-6 shadow-[0_-1rem_3rem_rgba(26,26,46,0.22)] sm:rounded-3xl sm:pb-6 dark:bg-dark-1">
                <span className="mx-auto mb-4 block h-1.5 w-10 rounded-full bg-grey-light dark:bg-dark-3 sm:hidden" />
                <div className="flex items-center gap-3.5">
                    <Image src="/brand/app-icon-192.png" alt="" width={52} height={52} unoptimized className="rounded-xl shadow-lift" />
                    <div className="min-w-0">
                        <h2 className="text-h5 text-black dark:text-white">Add Flow Admin to your Home Screen</h2>
                        <p className="text-caption-1 text-grey">Launch it like a native app, full-screen and one tap away.</p>
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose} className="ml-auto btn-circle h-9 w-9 dark:bg-dark-1">
                        <Icon name="close" classSize="w-5 h-5" className="fill-grey" />
                    </button>
                </div>

                <ol className="mt-6 flex flex-col gap-4">
                    {platform === "ios" ? (
                        <>
                            <Step n={1}>
                                Tap the <span className="font-semibold">Share</span> button
                                <Icon name="share" classSize="w-5 h-5" className="mx-1 -mt-0.5 inline fill-secondary" />
                                in Safari&rsquo;s toolbar.
                            </Step>
                            <Step n={2}>
                                Scroll down and choose <span className="font-semibold">Add to Home Screen</span>
                                <Icon name="add-app" classSize="w-5 h-5" className="mx-1 -mt-0.5 inline fill-primary" />.
                            </Step>
                            <Step n={3}>Tap <span className="font-semibold">Add</span> in the top corner. Done.</Step>
                        </>
                    ) : (
                        <>
                            <Step n={1}>
                                Open the browser <span className="font-semibold">menu</span>
                                <Icon name="dots" classSize="w-5 h-5" className="mx-1 -mt-0.5 inline fill-grey" />.
                            </Step>
                            <Step n={2}>Tap <span className="font-semibold">Install app</span> or <span className="font-semibold">Add to Home screen</span>.</Step>
                            <Step n={3}>Confirm, and Flow Admin lands on your Home Screen.</Step>
                        </>
                    )}
                </ol>

                <button type="button" onClick={onClose} className="btn-primary mt-6 w-full">Got it</button>
            </div>
        </div>,
        document.body,
    );
}

/* ── Button entry point (place in settings / sidebar) ───────────────────────── */
export function InstallAppButton({ className, label = "Add to Home Screen" }: { className?: string; label?: string }) {
    const { mounted, standalone, platform, canPrompt, nativePrompt } = useInstallState();
    const [sheet, setSheet] = useState(false);

    if (!mounted || standalone) return null;

    const onClick = async () => {
        if (canPrompt) {
            const ok = await nativePrompt();
            if (ok) return;
        }
        setSheet(true);
    };

    return (
        <>
            <button type="button" onClick={onClick} className={cn("btn-primary", className)}>
                <Icon name="add-app" classSize="w-5 h-5" className="fill-white" />
                {label}
            </button>
            {sheet && <InstallSheet platform={platform} onClose={() => setSheet(false)} />}
        </>
    );
}

/* ── Settings card (self-hides once installed) ──────────────────────────────── */
export function InstallAppCard() {
    const { mounted, standalone } = useInstallState();
    if (!mounted || standalone) return null;
    return (
        <div className="flex flex-col gap-4 rounded-2xl border border-grey-light p-5 sm:flex-row sm:items-center dark:border-grey-light/10">
            <Image src="/brand/app-icon-192.png" alt="" width={48} height={48} unoptimized className="shrink-0 rounded-xl shadow-lift" />
            <div className="grow">
                <div className="text-title font-semibold text-black dark:text-white">Install Flow Admin</div>
                <div className="text-caption-1 text-grey">Add it to your Home Screen or desktop to launch full-screen, like a native app.</div>
            </div>
            <InstallAppButton className="btn-md shrink-0" />
        </div>
    );
}

/* ── Auto banner (mobile, one-time, dismissible) ────────────────────────────── */
export function InstallAppBanner() {
    const { mounted, standalone, platform, canPrompt, nativePrompt } = useInstallState();
    const [dismissed, setDismissed] = useState(true);
    const [sheet, setSheet] = useState(false);

    useEffect(() => {
        // Read the one-time dismissal flag after mount (localStorage is client-only).
        /* eslint-disable react-hooks/set-state-in-effect */
        try {
            setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
        } catch {
            setDismissed(false);
        }
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    const close = () => {
        setDismissed(true);
        try {
            localStorage.setItem(DISMISS_KEY, "1");
        } catch {
            /* private mode */
        }
    };

    // Only worth a banner on touch platforms where install is possible.
    const eligible = platform === "ios" || platform === "android" || canPrompt;
    if (!mounted || standalone || dismissed || !eligible) return null;

    const onAdd = async () => {
        if (canPrompt) {
            const ok = await nativePrompt();
            if (ok) return close();
        }
        setSheet(true);
    };

    return (
        <>
            <div className="pb-safe fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+4.75rem)] lg:hidden">
                <div className="animate-sheet-up mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_0.75rem_2rem_rgba(26,26,46,0.18)] ring-1 ring-grey-light dark:bg-dark-1 dark:ring-grey-light/10">
                    <Image src="/brand/app-icon-192.png" alt="" width={40} height={40} unoptimized className="shrink-0 rounded-xl" />
                    <div className="min-w-0 grow">
                        <div className="text-caption-1 font-semibold text-black dark:text-white">Install Flow Admin</div>
                        <div className="truncate text-caption-2 text-grey">Add it to your Home Screen for an app experience.</div>
                    </div>
                    <button type="button" onClick={onAdd} className="btn-primary btn-sm shrink-0">Add</button>
                    <button type="button" aria-label="Dismiss" onClick={close} className="shrink-0 rounded-lg p-1 text-grey">
                        <Icon name="close" classSize="w-4 h-4" className="fill-grey" />
                    </button>
                </div>
            </div>
            {sheet && <InstallSheet platform={platform} onClose={() => setSheet(false)} />}
        </>
    );
}
