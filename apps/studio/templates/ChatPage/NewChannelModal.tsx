"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import { Dialog, Transition } from "@headlessui/react";
import Icon from "@/components/ui/Icon";
import Checkbox from "@/components/ui/Checkbox";
import { chatRoleMeta, type ChatMember } from "@/mocks/chat";

/**
 * Create-task-channel modal. Anyone can start a task channel; the current user
 * and the Super Admin are added automatically, then the creator picks any other
 * members. Visibility is members-only (enforced in ChatPage).
 */
const NewChannelModal = ({
    open,
    onClose,
    onCreate,
    members,
    meId,
    superId,
}: {
    open: boolean;
    onClose: () => void;
    onCreate: (name: string, topic: string, memberIds: string[]) => void;
    members: ChatMember[];
    meId: string;
    superId: string;
}) => {
    const [name, setName] = useState("");
    const [topic, setTopic] = useState("");
    const [picked, setPicked] = useState<string[]>([]);

    // Members the creator can add (everyone except themselves + the auto-added super).
    const selectable = members.filter((m) => m.id !== meId && m.id !== superId);
    const autoAdded = members.filter((m) => m.id === meId || m.id === superId);

    const toggle = (id: string) =>
        setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

    const reset = () => {
        setName("");
        setTopic("");
        setPicked([]);
    };

    const create = () => {
        if (!name.trim()) return;
        onCreate(name.trim(), topic.trim(), picked);
        reset();
    };

    return (
        <Transition appear show={open} as={Fragment}>
            <Dialog
                as="div"
                className="relative z-50"
                onClose={() => {
                    reset();
                    onClose();
                }}
            >
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
                            <Dialog.Panel className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[0_1.25rem_3rem_rgba(26,26,46,0.18)] dark:bg-dark-1">
                                <div className="flex items-start justify-between mb-5">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center justify-center w-10 h-10 rounded-[0.75rem] bg-lavender-mist dark:bg-dark-3">
                                            <Icon className="w-5 h-5 fill-primary" name="lock" />
                                        </span>
                                        <div>
                                            <Dialog.Title className="text-h5 text-black dark:text-white">
                                                New task channel
                                            </Dialog.Title>
                                            <p className="text-caption-2 text-grey">
                                                Private: only members can see it.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            reset();
                                            onClose();
                                        }}
                                        aria-label="Close"
                                        className="btn-circle w-9 h-9 dark:bg-dark-3"
                                    >
                                        <Icon className="w-4 h-4 fill-grey" name="close" />
                                    </button>
                                </div>

                                <label className="block mb-4">
                                    <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                        Channel name
                                    </span>
                                    <input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. Spring Campaign"
                                        className="flow-input"
                                        autoFocus
                                    />
                                </label>

                                <label className="block mb-5">
                                    <span className="mb-1.5 block text-caption-1 text-black dark:text-white">
                                        Topic <span className="text-grey">(optional)</span>
                                    </span>
                                    <input
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        placeholder="What's this channel about?"
                                        className="flow-input"
                                    />
                                </label>

                                <div className="mb-2 text-caption-1 text-black dark:text-white">
                                    Members
                                </div>
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    {autoAdded.map((m) => (
                                        <span
                                            key={m.id}
                                            className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-pill bg-lavender-mist dark:bg-dark-3"
                                        >
                                            <Image
                                                src={m.avatar}
                                                alt={m.name}
                                                width={20}
                                                height={20}
                                                className="w-5 h-5 rounded-full object-cover"
                                            />
                                            <span className="text-caption-2 font-semibold text-black dark:text-white">
                                                {m.id === meId ? "You" : m.name}
                                            </span>
                                        </span>
                                    ))}
                                    <span className="text-caption-2 text-grey">
                                        added automatically
                                    </span>
                                </div>

                                <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-grey-light dark:scrollbar-thumb-dark-3">
                                    {selectable.map((m) => {
                                        const role = chatRoleMeta[m.role];
                                        const on = picked.includes(m.id);
                                        return (
                                            <button
                                                type="button"
                                                key={m.id}
                                                onClick={() => toggle(m.id)}
                                                className="flex items-center gap-3 px-2 py-2 rounded-2xl text-left transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
                                            >
                                                <Image
                                                    src={m.avatar}
                                                    alt={m.name}
                                                    width={36}
                                                    height={36}
                                                    className="w-9 h-9 rounded-full object-cover shrink-0"
                                                />
                                                <div className="grow min-w-0">
                                                    <div className="text-title text-black dark:text-white">
                                                        {m.name}
                                                    </div>
                                                    <div
                                                        className="text-caption-2 font-semibold"
                                                        style={{ color: role.color }}
                                                    >
                                                        {role.label}
                                                    </div>
                                                </div>
                                                <Checkbox
                                                    checked={on}
                                                    onChange={() => toggle(m.id)}
                                                    aria-label={`Add ${m.name}`}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            reset();
                                            onClose();
                                        }}
                                        className="btn-secondary grow"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={create}
                                        disabled={!name.trim()}
                                        className="btn-primary grow"
                                    >
                                        Create channel
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

export default NewChannelModal;
