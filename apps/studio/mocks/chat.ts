import type { Role } from "@/lib/roles";

/**
 * Mock data for the internal Chat (Slack-style channels + task channels) — themed
 * to the "Northbound" studio.
 *
 * Permission model (enforced in ChatPage):
 *   - Universal channels (kind "channel", private:false) are visible to everyone.
 *   - Task channels (kind "task", private:true) are visible only to their members.
 *   - The Super User is a member of every channel and can see all of them.
 *   - Anyone can create a task channel and add members; the Super User is
 *     auto-added on creation.
 * Backend (auth + websockets) replaces this later.
 */

export type ChatRole = Role | "agent";

export type ChatMember = {
    id: string;
    name: string;
    avatar: string;
    role: ChatRole;
    online?: boolean;
};

/** Role badge tint (mirrors dashboard roleMeta where they overlap). */
export const chatRoleMeta: Record<ChatRole, { label: string; color: string }> = {
    super: { label: "Super Admin", color: "#6C5CE7" },
    admin: { label: "Admin", color: "#3B82F6" },
    seo: { label: "SEO Manager", color: "#00B894" },
    editor: { label: "Editor", color: "#F5A623" },
    agent: { label: "AI Agent", color: "#A29BFE" },
};

export const chatMembers: ChatMember[] = [
    { id: "u-sarah", name: "Sarah Whitfield", avatar: "/images/avatar.png", role: "super", online: true },
    { id: "u-marcus", name: "Marcus Bennett", avatar: "/images/avatar-1.png", role: "admin", online: true },
    { id: "u-priya", name: "Priya Nair", avatar: "/images/avatar-2.png", role: "seo", online: true },
    { id: "u-daniel", name: "Daniel Brooks", avatar: "/images/avatar-3.png", role: "editor", online: false },
    { id: "u-olivia", name: "Olivia Hayes", avatar: "/images/avatar-4.png", role: "editor", online: true },
    { id: "u-liam", name: "Liam Foster", avatar: "/images/avatar-1.png", role: "editor", online: true },
    { id: "u-flow", name: "FlowCMS AI", avatar: "/images/avatar.png", role: "agent", online: true },
];

/** Map the active dashboard role to the member who "is" the current user. */
export const roleToMemberId: Record<Role, string> = {
    super: "u-sarah",
    admin: "u-marcus",
    seo: "u-priya",
    editor: "u-daniel",
};

export type ChatAttachment = { name: string; size: string; color: string };

export type ChatMessage = {
    id: string;
    channelId: string;
    senderId: string;
    time: string; // display time
    /** day group label, e.g. "Today", "Yesterday". */
    day: string;
    text: string;
    attachments?: ChatAttachment[];
};

export type Channel = {
    id: string;
    kind: "channel" | "task";
    name: string;
    topic: string;
    private: boolean;
    memberIds: string[];
    createdBy?: string;
    unread?: number;
};

export const initialChannels: Channel[] = [
    {
        id: "general",
        kind: "channel",
        name: "general",
        topic: "Studio-wide announcements & chatter",
        private: false,
        memberIds: chatMembers.map((m) => m.id),
    },
    {
        id: "content",
        kind: "channel",
        name: "content",
        topic: "Drafts, reviews & publishing",
        private: false,
        memberIds: chatMembers.map((m) => m.id),
        unread: 3,
    },
    {
        id: "design",
        kind: "channel",
        name: "design",
        topic: "Design crits, brand & UI",
        private: false,
        memberIds: chatMembers.map((m) => m.id),
    },
    {
        id: "seo",
        kind: "channel",
        name: "seo",
        topic: "Rankings, audits & keyword strategy",
        private: false,
        memberIds: chatMembers.map((m) => m.id),
    },
    {
        id: "random",
        kind: "channel",
        name: "random",
        topic: "Off-topic, links & water-cooler",
        private: false,
        memberIds: chatMembers.map((m) => m.id),
    },
    {
        id: "task-lumen",
        kind: "task",
        name: "Lumen rebrand",
        topic: "Brand identity + marketing site for Lumen",
        private: true,
        memberIds: ["u-sarah", "u-priya", "u-liam"],
        createdBy: "u-sarah",
        unread: 2,
    },
    {
        id: "task-atlas",
        kind: "task",
        name: "Atlas Coffee site",
        topic: "DTC store redesign & migration",
        private: true,
        memberIds: ["u-sarah", "u-marcus", "u-liam", "u-flow"],
        createdBy: "u-marcus",
    },
    {
        id: "task-q3",
        kind: "task",
        name: "Q3 campaign",
        topic: "Launch campaign — positioning to go-live",
        private: true,
        memberIds: ["u-sarah", "u-marcus", "u-olivia"],
        createdBy: "u-marcus",
    },
];

export const initialMessages: ChatMessage[] = [
    // general
    { id: "m1", channelId: "general", senderId: "u-marcus", time: "9:02 AM", day: "Yesterday", text: "Morning team 👋 Reminder: the Lumen presentation is Thursday — let's have v2 ready Wednesday EOD." },
    { id: "m2", channelId: "general", senderId: "u-priya", time: "9:14 AM", day: "Yesterday", text: "Got it. The SEO audit for the Vantage relaunch will be wrapped by Thursday." },
    { id: "m3", channelId: "general", senderId: "u-sarah", time: "10:30 AM", day: "Today", text: "Great month everyone — Atlas Coffee just shared their numbers, conversion is up 2.1× since launch 🚀" },
    { id: "m4", channelId: "general", senderId: "u-olivia", time: "10:41 AM", day: "Today", text: "Love that. The case study is going to write itself." },

    // content
    { id: "m5", channelId: "content", senderId: "u-daniel", time: "8:50 AM", day: "Today", text: "Pushed “Motion that adds meaning” for review — can someone take a look?" },
    { id: "m6", channelId: "content", senderId: "u-priya", time: "9:05 AM", day: "Today", text: "On it. Flagging two thin sections, otherwise it's strong.", attachments: [{ name: "edit-notes.pdf", size: "1.2 MB", color: "#CFC8FF" }] },
    { id: "m7", channelId: "content", senderId: "u-marcus", time: "9:20 AM", day: "Today", text: "Approved the Q3 campaign landing page btw — it's scheduled for next week." },

    // design
    { id: "m8", channelId: "design", senderId: "u-liam", time: "8:15 AM", day: "Today", text: "The Orbit component library is in Figma — would love eyes on the button states before I build them out." },
    { id: "m9", channelId: "design", senderId: "u-sarah", time: "8:40 AM", day: "Today", text: "Looks sharp. Tighten the focus ring on the secondary and ship it." },

    // seo
    { id: "m10", channelId: "seo", senderId: "u-flow", time: "7:30 AM", day: "Today", text: "Detected keyword cannibalization on “brand strategy agency” across 2 pages. Want me to draft consolidation suggestions?" },
    { id: "m11", channelId: "seo", senderId: "u-priya", time: "8:10 AM", day: "Today", text: "Yes please — prioritize the services page over the older blog post." },

    // task-lumen
    { id: "m12", channelId: "task-lumen", senderId: "u-sarah", time: "11:00 AM", day: "Yesterday", text: "Kicking off the Lumen rebrand here. Positioning workshop notes are pinned above." },
    { id: "m13", channelId: "task-lumen", senderId: "u-liam", time: "11:12 AM", day: "Yesterday", text: "First identity direction coming today — three routes to react to." },
    { id: "m14", channelId: "task-lumen", senderId: "u-priya", time: "2:45 PM", day: "Today", text: "I'll prep the messaging hierarchy so copy and design move together." },

    // task-atlas
    { id: "m15", channelId: "task-atlas", senderId: "u-marcus", time: "3:00 PM", day: "Yesterday", text: "Atlas migration to the new store ran clean on staging — all 240 products imported." },
    { id: "m16", channelId: "task-atlas", senderId: "u-flow", time: "3:05 PM", day: "Yesterday", text: "I re-generated alt text for 38 product images that were missing it." },

    // task-q3
    { id: "m17", channelId: "task-q3", senderId: "u-marcus", time: "1:15 PM", day: "Today", text: "First campaign hero is in the editor — feedback welcome.", attachments: [{ name: "hero-v1.png", size: "3.6 MB", color: "#A0D7E7" }] },
];
