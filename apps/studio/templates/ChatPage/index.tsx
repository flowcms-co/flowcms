"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/lib/api";
import { useRealtime, rtEmit } from "@/lib/realtime";
import { relTime } from "@/lib/useNotifications";
import { cn } from "@/lib/cn";

type Channel = { id: string; name: string; kind: string; isPrivate: boolean; members: number; lastMessage: string | null };
type Message = { id: string; body: string; createdAt: string; channelId?: string; author: { id: string; name: string } };
type Member = { id: string; name: string; email: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Render message text with `@Name` mentions of known members highlighted. */
function renderBody(body: string, names: string[]): React.ReactNode {
    if (!names.length) return body;
    const re = new RegExp(`@(${names.map(escapeRe).join("|")})\\b`, "gi");
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(body))) {
        if (m.index > last) out.push(body.slice(last, m.index));
        out.push(
            <span key={i++} className="rounded-[4px] bg-primary/15 px-1 font-semibold text-primary dark:text-lilac">
                {m[0]}
            </span>,
        );
        last = m.index + m[0].length;
    }
    if (last < body.length) out.push(body.slice(last));
    return out;
}

/**
 * Internal Chat — live channels + messages (polled every ~3s). A universal
 * "general" channel everyone joins, plus group channels anyone can create.
 */
const ChatPage = () => {
    const { user } = useAuth();
    const meId = user?.id;

    const [channels, setChannels] = useState<Channel[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [mobileView, setMobileView] = useState<"list" | "thread">("list");
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [members, setMembers] = useState<Member[]>([]);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const memberNames = useMemo(() => members.map((m) => m.name), [members]);
    // Trailing `@token` the user is currently typing → drives the mention popup.
    const mentionQuery = (() => {
        const m = input.match(/(?:^|\s)@([\w][\w-]*)?$/);
        return m ? (m[1] ?? "") : null;
    })();
    const mentionMatches =
        mentionQuery === null
            ? []
            : members
                  .filter((m) => !mentionQuery || m.name.toLowerCase().includes(mentionQuery.toLowerCase()) || m.email.toLowerCase().startsWith(mentionQuery.toLowerCase()))
                  .slice(0, 6);

    const loadChannels = useCallback(async () => {
        try {
            const list = await api<Channel[]>("/chat/channels");
            setChannels(list);
            setActiveId((cur) => cur || list[0]?.id || "");
        } catch {
            /* ignore */
        }
    }, []);

    const loadMessages = useCallback(async (channelId: string) => {
        if (!channelId) return;
        try {
            setMessages(await api<Message[]>(`/chat/channels/${channelId}/messages`));
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadChannels();
        const t = setInterval(loadChannels, 10000);
        return () => clearInterval(t);
    }, [loadChannels]);

    // Members for @mention autocomplete + highlight.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        api<Member[]>("/chat/members").then(setMembers).catch(() => {});
    }, []);

    useEffect(() => {
        if (!activeId) return;
        void loadMessages(activeId);
        // Realtime delivers new messages instantly; poll is a slow fallback.
        const t = setInterval(() => loadMessages(activeId), 8000);
        return () => clearInterval(t);
    }, [activeId, loadMessages]);

    // Join the active channel's realtime room + append live messages (deduped).
    useEffect(() => {
        if (activeId) rtEmit("chat:join", activeId);
    }, [activeId]);
    useRealtime<Message>(
        "chat:message",
        (msg) => {
            if (msg.channelId && msg.channelId !== activeId) return;
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
        [activeId],
    );

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const pickMention = (name: string) => {
        setInput((cur) => cur.replace(/(^|\s)@([\w][\w-]*)?$/, `$1@${name} `));
        inputRef.current?.focus();
    };

    const active = channels.find((c) => c.id === activeId);

    const select = (id: string) => {
        setActiveId(id);
        setMessages([]);
        setMobileView("thread");
    };

    const send = async () => {
        const text = input.trim();
        if (!text || !activeId) return;
        setInput("");
        try {
            const m = await api<Message>(`/chat/channels/${activeId}/messages`, { method: "POST", body: JSON.stringify({ body: text }) });
            setMessages((prev) => [...prev, m]);
            void loadChannels();
        } catch {
            setInput(text); // restore on failure
        }
    };

    const createChannel = async () => {
        const name = newName.trim();
        if (!name) return;
        try {
            const c = await api<Channel>("/chat/channels", { method: "POST", body: JSON.stringify({ name }) });
            setNewName("");
            setCreating(false);
            await loadChannels();
            select(c.id);
        } catch {
            /* ignore */
        }
    };

    return (
        <div className="flex h-[calc(100dvh-9rem)] min-h-[34rem] overflow-hidden rounded-3xl bg-white shadow-[0_0.5rem_2rem_rgba(227,230,236,0.55)] dark:bg-dark-1 dark:shadow-[0_0.5rem_2rem_rgba(0,0,0,0.30)]">
            {/* Channel list */}
            <div className={cn("w-full shrink-0 flex-col lg:flex lg:w-[19rem] lg:border-r lg:border-grey-light dark:lg:border-grey-light/10", mobileView === "thread" ? "hidden" : "flex")}>
                <div className="flex items-center justify-between px-5 h-[4.25rem] border-b border-grey-light dark:border-grey-light/10">
                    <h2 className="text-h6 text-black dark:text-white">Channels</h2>
                    <button type="button" onClick={() => setCreating((v) => !v)} aria-label="New channel" className="btn-circle w-9 h-9 dark:bg-dark-3">
                        <Icon className="w-4 h-4 fill-black dark:fill-white" name="plus" />
                    </button>
                </div>
                {creating && (
                    <div className="flex items-center gap-2 p-3 border-b border-grey-light dark:border-grey-light/10">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && createChannel()}
                            autoFocus
                            placeholder="channel-name"
                            className="flow-input h-9 text-caption-1"
                        />
                        <button type="button" onClick={createChannel} className="btn-primary h-9 px-3 text-caption-1 shrink-0">Add</button>
                    </div>
                )}
                <div className="flex flex-col gap-0.5 overflow-y-auto p-2">
                    {channels.map((c) => {
                        const isActive = c.id === activeId;
                        return (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => select(c.id)}
                                className={cn("flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors", isActive ? "bg-primary text-white" : "hover:bg-lavender-mist dark:hover:bg-dark-3")}
                            >
                                <Icon className={cn("w-4 h-4 shrink-0", isActive ? "fill-white" : "fill-grey")} name={c.kind === "UNIVERSAL" ? "hash" : c.isPrivate ? "lock" : "hash"} />
                                <span className="min-w-0 grow">
                                    <span className={cn("block truncate text-title", isActive ? "text-white" : "text-black dark:text-white")}>{c.name}</span>
                                    {c.lastMessage && <span className={cn("block truncate text-caption-2", isActive ? "text-white/80" : "text-grey")}>{c.lastMessage}</span>}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Thread */}
            <div className={cn("grow flex-col lg:flex", mobileView === "list" ? "hidden" : "flex")}>
                {active ? (
                    <>
                        <div className="flex items-center gap-3 px-5 h-[4.25rem] border-b border-grey-light dark:border-grey-light/10">
                            <button type="button" onClick={() => setMobileView("list")} aria-label="Back" className="btn-circle w-9 h-9 lg:hidden dark:bg-dark-3">
                                <Icon className="w-4 h-4 fill-black dark:fill-white" name="arrow-left" />
                            </button>
                            <Icon className="w-5 h-5 fill-grey" name={active.kind === "UNIVERSAL" ? "hash" : active.isPrivate ? "lock" : "hash"} />
                            <div className="min-w-0">
                                <div className="truncate text-title text-black dark:text-white">{active.name}</div>
                                <div className="text-caption-2 text-grey">{active.members} member{active.members === 1 ? "" : "s"}</div>
                            </div>
                        </div>

                        <div className="grow overflow-y-auto px-5 py-4 flex flex-col gap-3">
                            {messages.length === 0 ? (
                                <div className="flex h-full items-center justify-center text-caption-2 text-grey">No messages yet: say hello 👋</div>
                            ) : (
                                messages.map((m) => {
                                    const mine = m.author.id === meId;
                                    return (
                                        <div key={m.id} className={cn("flex items-end gap-2.5 max-w-[80%]", mine ? "self-end flex-row-reverse" : "self-start")}>
                                            <Avatar userId={m.author.id} name={m.author.name} size={32} ring />

                                            <div className={cn("rounded-2xl px-3.5 py-2", mine ? "bg-primary text-white" : "bg-lavender-mist text-black dark:bg-dark-3 dark:text-white")}>
                                                {!mine && <div className="mb-0.5 text-caption-2 font-semibold text-primary dark:text-lilac">{m.author.name}</div>}
                                                <div className="text-body-sm whitespace-pre-wrap break-words">{renderBody(m.body, memberNames)}</div>
                                                <div className={cn("mt-1 text-[0.625rem]", mine ? "text-white/70" : "text-grey")}>{relTime(m.createdAt)}</div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={endRef} />
                        </div>

                        <div className="relative flex items-center gap-2 p-3 border-t border-grey-light dark:border-grey-light/10">
                            {mentionMatches.length > 0 && (
                                <div className="absolute bottom-full left-3 mb-2 w-64 overflow-hidden rounded-lg border border-grey-light bg-white shadow-[0_0.5rem_1.5rem_rgba(26,26,46,0.15)] dark:border-grey-light/10 dark:bg-dark-2">
                                    {mentionMatches.map((m) => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                pickMention(m.name);
                                            }}
                                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-lavender-mist dark:hover:bg-dark-3"
                                        >
                                            <Avatar userId={m.id} name={m.name} size={28} />
                                            <span className="min-w-0">
                                                <span className="block truncate text-caption-1 font-semibold text-black dark:text-white">{m.name}</span>
                                                <span className="block truncate text-[0.6875rem] text-grey">{m.email}</span>
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Escape") return;
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        if (mentionMatches.length > 0) {
                                            e.preventDefault();
                                            pickMention(mentionMatches[0].name);
                                            return;
                                        }
                                        e.preventDefault();
                                        send();
                                    }
                                }}
                                placeholder={`Message #${active.name}: use @ to mention`}
                                className="flow-input grow"
                            />
                            <button type="button" onClick={send} disabled={!input.trim()} className="btn-primary h-11 w-11 !p-0 shrink-0 disabled:opacity-60">
                                <Icon className="w-5 h-5 fill-white" name="send" />
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center text-grey">Select a channel to start chatting.</div>
                )}
            </div>
        </div>
    );
};

export default ChatPage;
