"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * App-wide confirmation dialog. Replaces native `window.confirm` with an on-brand
 * modal (matches CreateWorkspaceModal's styling). Two ways to call it, both async
 * (resolve true on confirm, false on cancel / backdrop / Escape):
 *
 *   import { confirm } from "@/components/providers/ConfirmProvider";
 *   if (!(await confirm({ title: "Delete this?", tone: "danger" }))) return;
 *
 *   // or, inside a component, via the hook:
 *   const confirm = useConfirm();
 */
export type ConfirmOptions = {
    title: string;
    /** Optional supporting text. Newlines are preserved. */
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    /** "danger" renders a destructive (red) confirm button. */
    tone?: "default" | "danger";
    /** Notice mode: a single OK button (the on-brand replacement for window.alert). */
    noticeOnly?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const useConfirm = (): ConfirmFn => {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>.");
    return ctx;
};

// Imperative bridge (toast-style): the mounted provider registers its requester
// here so any module can `await confirm(...)` without the hook. Native browser
// dialogs (window.confirm / alert / prompt) are BANNED in this codebase; if the
// provider isn't mounted the request fails safe with "no".
let imperative: ConfirmFn | null = null;
export const confirm: ConfirmFn = (opts) => {
    if (imperative) return imperative(opts);
    return Promise.resolve(false);
};

/** On-brand replacement for window.alert: a single-button notice dialog. */
export const notice = (opts: Omit<ConfirmOptions, "noticeOnly" | "cancelLabel">): Promise<void> =>
    confirm({ confirmLabel: "OK", ...opts, noticeOnly: true }).then(() => undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const [opts, setOpts] = useState<ConfirmOptions>({ title: "" });
    const resolver = useRef<((v: boolean) => void) | null>(null);

    const requestConfirm = useCallback<ConfirmFn>((next) => {
        setOpts(next);
        setOpen(true);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    // Register the imperative bridge for the lifetime of the provider.
    useEffect(() => {
        imperative = requestConfirm;
        return () => {
            if (imperative === requestConfirm) imperative = null;
        };
    }, [requestConfirm]);

    const settle = useCallback((value: boolean) => {
        setOpen(false);
        resolver.current?.(value);
        resolver.current = null;
    }, []);

    const danger = opts.tone === "danger";

    return (
        <ConfirmContext.Provider value={requestConfirm}>
            {children}
            <Transition show={open} as={Fragment}>
                <Dialog as="div" className="relative z-[60]" onClose={() => settle(false)}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-150"
                        enterFrom="opacity-0"
                        enterTo="opacity-100"
                        leave="ease-in duration-100"
                        leaveFrom="opacity-100"
                        leaveTo="opacity-0"
                    >
                        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                    </Transition.Child>

                    <div className="fixed inset-0 overflow-y-auto">
                        <div className="flex min-h-full items-center justify-center p-4">
                            <Transition.Child
                                as={Fragment}
                                enter="ease-out duration-150"
                                enterFrom="opacity-0 scale-95"
                                enterTo="opacity-100 scale-100"
                                leave="ease-in duration-100"
                                leaveFrom="opacity-100 scale-100"
                                leaveTo="opacity-0 scale-95"
                            >
                                <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                    <div className="flex items-start gap-3">
                                        <span
                                            className={cn(
                                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem]",
                                                danger ? "bg-error/10" : "bg-lavender-mist dark:bg-dark-3",
                                            )}
                                        >
                                            <Icon className={cn("h-5 w-5", danger ? "fill-error" : "fill-primary")} name="info" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <Dialog.Title className="text-title font-semibold text-black dark:text-white">{opts.title}</Dialog.Title>
                                            {opts.message && (
                                                <p className="mt-1.5 whitespace-pre-line text-body-sm text-grey">{opts.message}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-6 flex gap-3">
                                        {!opts.noticeOnly && (
                                            <button type="button" onClick={() => settle(false)} className="btn-secondary grow">
                                                {opts.cancelLabel ?? "Cancel"}
                                            </button>
                                        )}
                                        <button type="button" onClick={() => settle(true)} className={cn("grow", danger ? "btn-danger-solid" : "btn-primary")} autoFocus>
                                            {opts.confirmLabel ?? (opts.noticeOnly ? "OK" : "Confirm")}
                                        </button>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </ConfirmContext.Provider>
    );
}
