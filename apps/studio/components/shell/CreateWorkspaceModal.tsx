"use client";

import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { switchWorkspace } from "@/lib/useWorkspaces";

/**
 * Create a new workspace (Enterprise). On success it switches the session into
 * the new workspace, which hard-reloads the app. Only mounted when the caller has
 * already confirmed the `multi_workspace` entitlement; the backend gates too.
 */
const CreateWorkspaceModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = () => {
        if (busy) return;
        setName("");
        setError(null);
        onClose();
    };

    const submit = async () => {
        const trimmed = name.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        setError(null);
        try {
            const ws = await api<{ id: string }>("/workspaces", {
                method: "POST",
                body: JSON.stringify({ name: trimmed }),
            });
            // Drop the caller into the workspace they just made (hard reload).
            await switchWorkspace(ws.id);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : "Could not create the workspace.");
            setBusy(false);
        }
    };

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={close}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-200"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-150"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-200"
                            enterFrom="opacity-0 scale-95 translate-y-2"
                            enterTo="opacity-100 scale-100 translate-y-0"
                            leave="ease-in duration-150"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="mb-5 flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-[0.75rem] bg-lavender-mist dark:bg-dark-3">
                                            <Icon className="h-5 w-5 fill-primary" name="overview" />
                                        </span>
                                        <div>
                                            <Dialog.Title className="text-h5 text-black dark:text-white">
                                                New workspace
                                            </Dialog.Title>
                                            <p className="text-caption-2 text-grey">
                                                A separate space with its own content, team and roles
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={close}
                                        aria-label="Close"
                                        className="btn-circle h-9 w-9 dark:bg-dark-3"
                                    >
                                        <Icon className="h-4 w-4 fill-grey" name="close" />
                                    </button>
                                </div>

                                <label htmlFor="ws-name" className="mb-2 block text-caption-1 text-black dark:text-white">
                                    Workspace name
                                </label>
                                <input
                                    id="ws-name"
                                    autoFocus
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && submit()}
                                    placeholder="e.g. Atlas Coffee"
                                    className="flow-input w-full"
                                    disabled={busy}
                                />
                                <p className="mt-2 text-caption-2 text-grey">
                                    You&apos;ll be added as its owner and switched into it.
                                </p>

                                {error && (
                                    <div className="mt-4 flex items-start gap-2 rounded-2xl bg-error/10 px-4 py-3 text-caption-1 text-error">
                                        <Icon className="mt-0.5 h-4 w-4 shrink-0 fill-error" name="close" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="mt-6 flex gap-3">
                                    <button type="button" onClick={close} disabled={busy} className="btn-secondary grow">
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submit}
                                        disabled={busy || !name.trim()}
                                        className="btn-primary grow gap-2"
                                    >
                                        {busy ? (
                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                        ) : (
                                            <Icon className="h-4 w-4 fill-white" name="plus" />
                                        )}
                                        {busy ? "Creating…" : "Create workspace"}
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default CreateWorkspaceModal;
