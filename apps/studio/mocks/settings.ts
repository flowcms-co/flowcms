/**
 * Settings mock data — team, API keys, webhooks, billing, integrations for the
 * "Northbound" studio. Backend wires real account data later.
 */
import type { Role } from "@/lib/roles";

export type TeamMember = {
    id: string;
    name: string;
    email: string;
    avatar: string;
    role: Role;
    status: "active" | "invited";
    lastActive: string;
};

export const teamMembers: TeamMember[] = [
    { id: "u-sarah", name: "Sarah Whitfield", email: "sarah@wearenorthbound.com", avatar: "/images/avatar.png", role: "super", status: "active", lastActive: "now" },
    { id: "u-marcus", name: "Marcus Bennett", email: "marcus@wearenorthbound.com", avatar: "/images/avatar-1.png", role: "admin", status: "active", lastActive: "2h ago" },
    { id: "u-priya", name: "Priya Nair", email: "priya@wearenorthbound.com", avatar: "/images/avatar-2.png", role: "seo", status: "active", lastActive: "1h ago" },
    { id: "u-daniel", name: "Daniel Brooks", email: "daniel@wearenorthbound.com", avatar: "/images/avatar-3.png", role: "editor", status: "active", lastActive: "5h ago" },
    { id: "u-olivia", name: "Olivia Hayes", email: "olivia@wearenorthbound.com", avatar: "/images/avatar-4.png", role: "editor", status: "active", lastActive: "3h ago" },
    { id: "u-liam", name: "Liam Foster", email: "liam@wearenorthbound.com", avatar: "/images/avatar-1.png", role: "editor", status: "active", lastActive: "yesterday" },
    { id: "u-emma", name: "Emma Clarke", email: "emma@wearenorthbound.com", avatar: "/images/avatar-2.png", role: "editor", status: "invited", lastActive: "—" },
];

export type ApiKey = {
    id: string;
    name: string;
    keyPreview: string;
    scope: "Read" | "Read & Write";
    created: string;
    lastUsed: string;
};

export const apiKeys: ApiKey[] = [
    { id: "k1", name: "Website (production)", keyPreview: "flow_live_••••••••a91c", scope: "Read", created: "Mar 2026", lastUsed: "2m ago" },
    { id: "k2", name: "Staging preview", keyPreview: "flow_test_••••••••7d2e", scope: "Read & Write", created: "Mar 2026", lastUsed: "3h ago" },
    { id: "k3", name: "Zapier automation", keyPreview: "flow_live_••••••••0b44", scope: "Read", created: "Apr 2026", lastUsed: "Yesterday" },
];

export type Webhook = {
    id: string;
    url: string;
    events: string[];
    active: boolean;
};

export const webhooks: Webhook[] = [
    { id: "w1", url: "https://wearenorthbound.com/api/revalidate", events: ["content.published", "content.updated"], active: true },
    { id: "w2", url: "https://hooks.slack.com/services/T02NB/B07/xZ4q", events: ["content.published"], active: true },
    { id: "w3", url: "https://hooks.zapier.com/hooks/catch/41027/northbound", events: ["content.scheduled", "content.deleted"], active: false },
];

export const webhookEvents = [
    "content.published",
    "content.updated",
    "content.scheduled",
    "content.deleted",
    "media.uploaded",
    "user.invited",
];

export type Invoice = {
    id: string;
    date: string;
    amount: string;
    status: "paid" | "due";
};

export const billing = {
    plan: "Growth",
    price: "$149",
    cycle: "per month",
    renews: "Jun 28, 2026",
    seats: { used: 7, total: 10 },
    apiCalls: { used: 412000, total: 1000000 },
    storage: { used: 18, total: 50 },
    invoices: [
        { id: "in1", date: "May 28, 2026", amount: "$149.00", status: "paid" as const },
        { id: "in2", date: "Apr 28, 2026", amount: "$149.00", status: "paid" as const },
        { id: "in3", date: "Mar 28, 2026", amount: "$149.00", status: "paid" as const },
    ] as Invoice[],
};

export type Integration = {
    id: string;
    name: string;
    desc: string;
    icon: string;
    color: string;
    connected: boolean;
};

export const integrations: Integration[] = [
    { id: "gsc", name: "Google Search Console", desc: "Keywords, impressions & coverage", icon: "search", color: "#4285F4", connected: true },
    { id: "ga4", name: "Google Analytics 4", desc: "Traffic, sessions & conversions", icon: "chart", color: "#F5A623", connected: true },
    { id: "slack", name: "Slack", desc: "Publish & review notifications", icon: "chat", color: "#E91E63", connected: true },
    { id: "zapier", name: "Zapier", desc: "Connect 6,000+ apps", icon: "compass", color: "#FF754C", connected: false },
];

export const notificationPrefs = [
    { id: "n1", label: "Content submitted for review", on: true },
    { id: "n2", label: "Content published", on: true },
    { id: "n3", label: "Comments & mentions", on: true },
    { id: "n4", label: "Weekly SEO digest", on: false },
    { id: "n5", label: "AI generation completed", on: false },
];

export const apiEndpoints = [
    { method: "GET", path: "/v1/content", desc: "List content entries" },
    { method: "POST", path: "/v1/content", desc: "Create a content entry" },
    { method: "GET", path: "/v1/content/{id}", desc: "Retrieve an entry" },
    { method: "PATCH", path: "/v1/content/{id}", desc: "Update an entry" },
    { method: "GET", path: "/v1/assets", desc: "List media assets" },
    { method: "POST", path: "/v1/publish", desc: "Publish or schedule" },
];
