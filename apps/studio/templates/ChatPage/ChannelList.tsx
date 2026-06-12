"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import type { Channel } from "@/mocks/chat";
import { cn } from "@/lib/cn";

/**
 * Left pane — searchable channel list, grouped into universal Channels and
 * permissioned Task channels. The active channel uses the same purple+glow
 * treatment as the sidebar nav. "New" opens the create-task-channel modal.
 */
const ChannelList = ({
    channels,
    activeId,
    onSelect,
    onNew,
}: {
    channels: Channel[];
    activeId: string;
    onSelect: (id: string) => void;
    onNew: () => void;
}) => {
    const [query, setQuery] = useState("");
    const q = query.trim().toLowerCase();
    const match = (c: Channel) => !q || c.name.toLowerCase().includes(q);

    const universal = channels.filter((c) => c.kind === "channel" && match(c));
    const tasks = channels.filter((c) => c.kind === "task" && match(c));

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h2 className="text-h5 text-black dark:text-white">Messages</h2>
                <button
                    type="button"
                    onClick={onNew}
                    className="btn-primary h-9 px-3 text-caption-1"
                >
                    <Icon className="w-4 h-4 fill-white" name="plus" />
                    New
                </button>
            </div>

            <div className="px-5 pb-3">
                <div className="flex items-center gap-2 rounded-2xl bg-lavender-mist px-3.5 h-10 dark:bg-dark-3">
                    <Icon className="w-4 h-4 fill-grey shrink-0" name="search" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search channels"
                        className="w-full bg-transparent text-body-sm text-black outline-none placeholder:text-grey dark:text-white"
                    />
                </div>
            </div>

            <div className="grow overflow-y-auto px-3 pb-4 scrollbar-thin scrollbar-thumb-grey-light dark:scrollbar-thumb-dark-3">
                <Group label="Channels">
                    {universal.map((c) => (
                        <ChannelRow
                            key={c.id}
                            channel={c}
                            active={c.id === activeId}
                            onClick={() => onSelect(c.id)}
                        />
                    ))}
                </Group>

                <Group label="Task channels">
                    {tasks.length === 0 ? (
                        <p className="px-3 py-2 text-caption-2 text-grey">
                            No task channels yet.
                        </p>
                    ) : (
                        tasks.map((c) => (
                            <ChannelRow
                                key={c.id}
                                channel={c}
                                active={c.id === activeId}
                                onClick={() => onSelect(c.id)}
                            />
                        ))
                    )}
                </Group>
            </div>
        </div>
    );
};

const Group = ({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) => (
    <div className="mb-4">
        <div className="px-3 mb-1.5 text-caption-2 font-semibold uppercase tracking-wide text-grey">
            {label}
        </div>
        <div className="flex flex-col gap-0.5">{children}</div>
    </div>
);

const ChannelRow = ({
    channel,
    active,
    onClick,
}: {
    channel: Channel;
    active: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            "group flex items-center gap-2.5 px-3 h-11 rounded-2xl text-left transition-all",
            active
                ? "bg-primary text-white shadow-glow"
                : "hover:bg-lavender-mist dark:hover:bg-dark-3",
        )}
    >
        <Icon
            className={cn(
                "w-4 h-4 shrink-0",
                active ? "fill-white" : "fill-grey",
            )}
            name={channel.private ? "lock" : "hash"}
        />
        <span
            className={cn(
                "grow truncate text-body-sm font-semibold",
                active ? "text-white" : "text-black dark:text-white",
            )}
        >
            {channel.name}
        </span>
        {channel.unread ? (
            <span
                className={cn(
                    "shrink-0 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-pill text-[0.6875rem] font-bold",
                    active ? "bg-white/25 text-white" : "bg-primary text-white",
                )}
            >
                {channel.unread}
            </span>
        ) : null}
    </button>
);

export default ChannelList;
