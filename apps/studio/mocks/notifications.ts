export type NotifCategory = "content" | "seo" | "comments" | "system";

export type Notification = {
    id: string;
    person: string;
    action: string;
    target: string;
    time: string;
    avatar: string;
    /** status badge color on the avatar (Unity style). */
    type: "success" | "info" | "warning" | "error";
    /** which filter group this belongs to on the notifications page. */
    category: NotifCategory;
    /** day bucket for the full page list. */
    day: "Today" | "Yesterday" | "Earlier";
    unread: boolean;
};

/** Notification badge icon per type. */
export const notifIcon: Record<Notification["type"], string> = {
    success: "check",
    info: "chat",
    warning: "clock",
    error: "close",
};
export const notifColor: Record<Notification["type"], string> = {
    success: "#00B894",
    info: "#3B82F6",
    warning: "#F5A623",
    error: "#E24B4A",
};

export const notifications: Notification[] = [
    {
        id: "n1",
        person: "Priya Nair",
        action: "published",
        target: "B2B SEO: content that earns its rankings",
        time: "2m ago",
        avatar: "/images/avatar-2.png",
        type: "success",
        category: "content",
        day: "Today",
        unread: true,
    },
    {
        id: "n2",
        person: "Daniel Brooks",
        action: "requested review on",
        target: "Motion that adds meaning",
        time: "26m ago",
        avatar: "/images/avatar-3.png",
        type: "info",
        category: "content",
        day: "Today",
        unread: true,
    },
    {
        id: "n3",
        person: "Flow AI",
        action: "flagged cannibalization on",
        target: "“brand strategy agency”",
        time: "1h ago",
        avatar: "/images/avatar.png",
        type: "warning",
        category: "seo",
        day: "Today",
        unread: true,
    },
    {
        id: "n4",
        person: "Marcus Bennett",
        action: "scheduled",
        target: "Q3 campaign — Launch ready",
        time: "3h ago",
        avatar: "/images/avatar-1.png",
        type: "info",
        category: "content",
        day: "Today",
        unread: false,
    },
    {
        id: "n5",
        person: "System",
        action: "webhook delivery failed to",
        target: "wearenorthbound.com/api/revalidate",
        time: "5h ago",
        avatar: "/images/avatar-4.png",
        type: "error",
        category: "system",
        day: "Today",
        unread: false,
    },
    {
        id: "n6",
        person: "Olivia Hayes",
        action: "commented on",
        target: "The case for fewer, better web pages",
        time: "Yesterday",
        avatar: "/images/avatar-4.png",
        type: "info",
        category: "comments",
        day: "Yesterday",
        unread: false,
    },
    {
        id: "n7",
        person: "Flow AI",
        action: "improved alt text on",
        target: "38 product images",
        time: "Yesterday",
        avatar: "/images/avatar.png",
        type: "success",
        category: "seo",
        day: "Yesterday",
        unread: false,
    },
    {
        id: "n8",
        person: "Marcus Bennett",
        action: "approved",
        target: "Harbor & Vine — a rebrand with room to grow",
        time: "Yesterday",
        avatar: "/images/avatar-1.png",
        type: "success",
        category: "content",
        day: "Yesterday",
        unread: false,
    },
    {
        id: "n9",
        person: "System",
        action: "completed sitemap rebuild for",
        target: "wearenorthbound.com",
        time: "2d ago",
        avatar: "/images/avatar-4.png",
        type: "success",
        category: "system",
        day: "Earlier",
        unread: false,
    },
    {
        id: "n10",
        person: "Priya Nair",
        action: "mentioned you in",
        target: "Topical clusters review",
        time: "3d ago",
        avatar: "/images/avatar-2.png",
        type: "info",
        category: "comments",
        day: "Earlier",
        unread: false,
    },
];
