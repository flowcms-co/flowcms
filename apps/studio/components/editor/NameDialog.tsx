"use client";

import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { ApiError } from "@/lib/api";

/** Asks for a template name (the on-brand stand-in for a prompt). `onSubmit` throws to show a message under the field, such as a name clash. */
const NameDialog = ({
    title,
    hint,
    initial = "",
    confirmLabel,
    onSubmit,
    onClose,
}: {
    title: string;
    hint?: string;
    initial?: string;
    confirmLabel: string;
    onSubmit: (name: string) => Promise<void>;
    onClose: () => void;
}) => {
    const [name, setName] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const submit = async () => {
        if (!name.trim() || busy) return;
        setBusy(true);
        setError("");
        try {
            await onSubmit(name.trim());
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Something went wrong.");
            setBusy(false);
        }
    };
    return (
        <Transition appear show as={Fragment}>
            <Dialog as="div" className="relative z-[70]" onClose={onClose}>
                <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                            <Dialog.Title className="text-title font-semibold text-black dark:text-white">{title}</Dialog.Title>
                            {hint && <p className="mt-1.5 text-body-sm text-grey">{hint}</p>}
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void submit();
                                }}
                            >
                                <label className="mt-4 block">
                                    <span className="mb-1 block text-caption-2 font-semibold text-black dark:text-white">Template name</span>
                                    <input className="flow-input" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                                </label>
                                <p className="mt-1 min-h-4 text-caption-2 text-error" aria-live="polite">
                                    {error}
                                </p>
                                <div className="mt-4 flex gap-3">
                                    <button type="button" onClick={onClose} className="btn-secondary grow">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={!name.trim() || busy} className="btn-primary grow">
                                        {busy ? "Saving…" : confirmLabel}
                                    </button>
                                </div>
                            </form>
                        </Dialog.Panel>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default NameDialog;
