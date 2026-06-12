import type { Role } from "@/lib/roles";

export type NavTab = { label: string; href: string; roles?: Role[]; group?: string };

export type NavItem = {
    title: string;
    icon: string;
    href: string;
    /** Roles allowed to see this item. Omit = all roles. */
    roles?: Role[];
    /** Sub-section tabs rendered inside the section page header. */
    tabs?: NavTab[];
    /** Optional unread/badge counter. Reserved for a real source (e.g. chat
     *  unread) once per-user read tracking lands; unset means no badge. */
    counter?: number;
};

/**
 * Top-level navigation (FlowCMS-Handoff.md §5): 7 items, each opening a page
 * with tabs for sub-sections (no deep nesting). Items hide/scope by role.
 */
export const NAV: NavItem[] = [
    {
        title: "Overview",
        icon: "overview",
        href: "/",
    },
    {
        title: "Content",
        icon: "document",
        href: "/content",
        tabs: [
            { label: "All Content", href: "/content" },
            { label: "Block Editor", href: "/content/editor" },
            { label: "Publish Queue", href: "/content/queue" },
            { label: "Quality", href: "/content/quality" },
        ],
    },
    {
        title: "SEO",
        icon: "chart",
        href: "/seo",
        roles: ["super", "admin", "seo"],
        // Slim 2-tab row: the Dashboard is the overview hub and the AI Optimizer is
        // the grouped scan + fix surface. Keywords, Markup, Internal links,
        // Cannibalization, AEO/GEO and Topical Clusters live on as hidden report
        // pages (not listed here) reached from Dashboard cards. Topical Clusters is
        // hidden until its production backend lands (see docs/TOPICAL_CLUSTER_IMPLIMENTATION.md).
        tabs: [
            { label: "Dashboard", href: "/seo" },
            { label: "AI Optimizer", href: "/seo/optimizer" },
        ],
    },
    {
        title: "AI Tools",
        icon: "sparkles",
        href: "/ai",
        tabs: [
            { label: "Content Generator", href: "/ai" },
            { label: "Proofreading", href: "/ai/proofreading" },
            { label: "Refresh Queue", href: "/ai/refresh" },
            { label: "The Brain", href: "/ai/knowledge", roles: ["super", "admin", "seo"] },
            { label: "Usage", href: "/ai/usage" },
        ],
    },
    {
        title: "Assets",
        icon: "folder",
        href: "/assets",
        tabs: [
            { label: "Library", href: "/assets" },
            { label: "Page Templates", href: "/assets/templates" },
        ],
    },
    {
        title: "Chat",
        icon: "chat",
        href: "/chat",
    },
    {
        title: "Settings",
        icon: "settings",
        href: "/settings",
        // One horizontal row like the other sections. Dense areas (Workspace,
        // Content, Integrations, Developers) are single pages with their own
        // sub-tab row, so this stays a clean 7 instead of a wall of tabs.
        tabs: [
            { label: "Profile", href: "/settings" },
            { label: "Security", href: "/settings/security" },
            { label: "Workspace", href: "/settings/workspace", roles: ["super", "admin"] },
            { label: "Plan", href: "/settings/plan", roles: ["super", "admin"] },
            { label: "Content", href: "/settings/content", roles: ["super", "admin"] },
            { label: "Integrations", href: "/settings/integrations", roles: ["super", "admin"] },
            { label: "Developers", href: "/settings/developers", roles: ["super", "admin"] },
        ],
    },
];

/** Filter the nav to the items a given role may see. */
export function navForRole(role: Role): NavItem[] {
    return NAV.filter((item) => !item.roles || item.roles.includes(role));
}
