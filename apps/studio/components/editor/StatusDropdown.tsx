"use client";

import { useState } from "react";
import { Menu, Transition } from "@headlessui/react";
import StatusPill, { type PillStatus } from "@/components/ui/StatusPill";
import Icon from "@/components/ui/Icon";

const OPTIONS: Exclude<PillStatus, "approved">[] = [
    "draft",
    "review",
    "scheduled",
    "live",
];

/** Document status selector for the editor topbar. */
const StatusDropdown = () => {
    const [status, setStatus] =
        useState<Exclude<PillStatus, "approved">>("draft");

    return (
        <Menu as="div" className="relative">
            <Menu.Button className="flex items-center gap-1.5 rounded-xl border border-grey-light px-2.5 py-1.5 transition-colors hover:border-primary dark:border-grey-light/10">
                <StatusPill status={status} />
                <Icon className="w-4 h-4 fill-grey" name="arrow-down" />
            </Menu.Button>
            <Transition
                enter="transition duration-100 ease-out"
                enterFrom="opacity-0 scale-95 -translate-y-1"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="transition duration-75 ease-in"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
            >
                <Menu.Items className="absolute right-0 z-3 mt-2 w-44 p-2 rounded-xl border border-grey-light bg-white shadow-[0_1.25rem_2.5rem_rgba(26,26,46,0.12)] focus:outline-none dark:bg-dark-1 dark:border-grey-light/10">
                    {OPTIONS.map((opt) => (
                        <Menu.Item key={opt}>
                            {() => (
                                <button
                                    type="button"
                                    onClick={() => setStatus(opt)}
                                    className="flex w-full items-center px-2 py-1.5 rounded-lg transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
                                >
                                    <StatusPill status={opt} />
                                </button>
                            )}
                        </Menu.Item>
                    ))}
                </Menu.Items>
            </Transition>
        </Menu>
    );
};

export default StatusDropdown;
