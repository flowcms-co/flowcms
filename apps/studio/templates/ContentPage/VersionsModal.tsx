"use client";

import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import VersionHistory from "@/components/activity/VersionHistory";

/** Version history for one entry, from the content list: preview, diff and restore. */
const VersionsModal = ({ entryId, title, onClose, onRestored }: { entryId: string | null; title: string; onClose: () => void; onRestored: () => void }) => (
    <Transition appear show={!!entryId} as={Fragment}>
        <Dialog as="div" className="relative z-40" onClose={onClose}>
            <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
                <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" />
            </Transition.Child>
            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4">
                    <Transition.Child as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95 translate-y-2" enterTo="opacity-100 scale-100 translate-y-0" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                        <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                            <Dialog.Title className="text-h5 text-black dark:text-white">Version history</Dialog.Title>
                            <p className="mt-0.5 mb-5 truncate text-caption-2 text-grey">{title}</p>
                            {entryId && <VersionHistory entryId={entryId} variant="modal" onRestored={onRestored} />}
                            <button type="button" onClick={onClose} className="btn-secondary w-full mt-6">Close</button>
                        </Dialog.Panel>
                    </Transition.Child>
                </div>
            </div>
        </Dialog>
    </Transition>
);

export default VersionsModal;
