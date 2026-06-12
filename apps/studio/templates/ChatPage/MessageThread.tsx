"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Icon from "@/components/ui/Icon";
import {
    chatRoleMeta,
    type Channel,
    type ChatMember,
    type ChatMessage,
} from "@/mocks/chat";

/**
 * Center pane — the active channel's conversation. Header shows the channel
 * identity + member avatar stack; the body groups messages by day; the composer
 * sends a new message (Enter or the send button). Back arrow returns to the
 * channel list on mobile.
 */
const MessageThread = ({
    channel,
    messages,
    members,
    meId,
    onSend,
    onBack,
}: {
    channel: Channel;
    messages: ChatMessage[];
    members: ChatMember[];
    meId: string;
    onSend: (text: string) => void;
    onBack: () => void;
}) => {
    const [draft, setDraft] = useState("");
    const byId = useMemo(
        () => Object.fromEntries(members.map((m) => [m.id, m])),
        [members],
    );
    const channelMembers = channel.memberIds
        .map((id) => byId[id])
        .filter(Boolean);

    // Group messages into consecutive day buckets, preserving order.
    const groups: { day: string; items: ChatMessage[] }[] = [];
    for (const msg of messages) {
        const last = groups[groups.length - 1];
        if (last && last.day === msg.day) last.items.push(msg);
        else groups.push({ day: msg.day, items: [msg] });
    }

    const submit = () => {
        const t = draft.trim();
        if (!t) return;
        onSend(t);
        setDraft("");
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 h-[4.5rem] border-b border-grey-light dark:border-grey-light/10">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to channels"
                    className="btn-circle w-9 h-9 lg:hidden dark:bg-dark-3"
                >
                    <Icon className="w-4 h-4 fill-black dark:fill-white" name="arrow-left" />
                </button>
                <span className="flex items-center justify-center w-10 h-10 rounded-[0.75rem] bg-lavender-mist shrink-0 dark:bg-dark-3">
                    <Icon
                        className="w-5 h-5 fill-primary"
                        name={channel.private ? "lock" : "hash"}
                    />
                </span>
                <div className="min-w-0 grow">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-title text-black dark:text-white">
                            {channel.kind === "channel" ? `#${channel.name}` : channel.name}
                        </span>
                        {channel.private && (
                            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-primary/10 text-primary text-[0.6875rem] font-semibold">
                                <Icon className="w-3 h-3 fill-primary" name="lock" />
                                Private
                            </span>
                        )}
                    </div>
                    <p className="truncate text-caption-2 text-grey">{channel.topic}</p>
                </div>

                {/* Member avatar stack */}
                <div className="hidden items-center sm:flex">
                    <div className="flex -space-x-2">
                        {channelMembers.slice(0, 4).map((m) => (
                            <Image
                                key={m.id}
                                src={m.avatar}
                                alt={m.name}
                                width={30}
                                height={30}
                                title={m.name}
                                className="w-[1.875rem] h-[1.875rem] rounded-full object-cover ring-2 ring-white dark:ring-dark-1"
                            />
                        ))}
                    </div>
                    {channelMembers.length > 4 && (
                        <span className="ml-1.5 text-caption-2 font-semibold text-grey">
                            +{channelMembers.length - 4}
                        </span>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="grow overflow-y-auto px-5 py-5 scrollbar-thin scrollbar-thumb-grey-light dark:scrollbar-thumb-dark-3">
                <div className="flex flex-col gap-5">
                    {groups.map((g) => (
                        <div key={g.day} className="flex flex-col gap-5">
                            <div className="flex items-center gap-3">
                                <span className="h-px grow bg-grey-light dark:bg-grey-light/10" />
                                <span className="text-caption-2 font-semibold text-grey">
                                    {g.day}
                                </span>
                                <span className="h-px grow bg-grey-light dark:bg-grey-light/10" />
                            </div>
                            {g.items.map((msg) => (
                                <MessageRow
                                    key={msg.id}
                                    msg={msg}
                                    sender={byId[msg.senderId]}
                                    mine={msg.senderId === meId}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Composer */}
            <div className="px-5 pb-5 pt-3">
                <div className="flex items-end gap-2 rounded-2xl border border-grey-light p-2 transition-colors focus-within:border-primary dark:border-grey-light/10">
                    <button
                        type="button"
                        aria-label="Attach file"
                        className="btn-circle w-10 h-10 shrink-0 dark:bg-dark-3"
                    >
                        <Icon className="w-5 h-5 fill-grey" name="image" />
                    </button>
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        rows={1}
                        placeholder={`Message ${
                            channel.kind === "channel" ? `#${channel.name}` : channel.name
                        }`}
                        className="grow resize-none max-h-32 bg-transparent px-1 py-2.5 text-body-sm text-black outline-none placeholder:text-grey dark:text-white"
                    />
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!draft.trim()}
                        aria-label="Send message"
                        className="btn-primary w-10 h-10 px-0 shrink-0"
                    >
                        <Icon className="w-[1.125rem] h-[1.125rem] fill-white" name="send" />
                    </button>
                </div>
            </div>
        </div>
    );
};

const MessageRow = ({
    msg,
    sender,
    mine,
}: {
    msg: ChatMessage;
    sender?: ChatMember;
    mine: boolean;
}) => {
    const role = sender ? chatRoleMeta[sender.role] : null;
    return (
        <div className="flex gap-3">
            <Image
                src={sender?.avatar || "/images/avatar.png"}
                alt={sender?.name || "User"}
                width={36}
                height={36}
                className="w-9 h-9 rounded-full object-cover shrink-0"
            />
            <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-title text-black dark:text-white">
                        {sender?.name || "Unknown"}
                        {mine && (
                            <span className="ml-1.5 text-caption-2 font-medium text-grey">
                                (you)
                            </span>
                        )}
                    </span>
                    {role && (
                        <span
                            className="inline-flex items-center px-2 py-0.5 rounded-pill text-[0.6875rem] font-semibold"
                            style={{ backgroundColor: `${role.color}1f`, color: role.color }}
                        >
                            {role.label}
                        </span>
                    )}
                    <span className="text-caption-2 text-grey">{msg.time}</span>
                </div>
                <p className="mt-1 text-body-sm text-black/90 dark:text-dark-text">
                    {msg.text}
                </p>
                {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {msg.attachments.map((a) => (
                            <div
                                key={a.name}
                                className="flex items-center gap-2.5 rounded-2xl border border-grey-light p-2 pr-4 dark:border-grey-light/10"
                            >
                                <span
                                    className="flex items-center justify-center w-9 h-9 rounded-[0.625rem] shrink-0"
                                    style={{ backgroundColor: a.color }}
                                >
                                    <Icon className="w-4 h-4 fill-white" name="document" />
                                </span>
                                <div className="leading-tight">
                                    <div className="text-caption-1 text-black dark:text-white">
                                        {a.name}
                                    </div>
                                    <div className="text-caption-2 text-grey">{a.size}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessageThread;
