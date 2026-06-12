/**
 * Role model for Flow CMS (FlowCMS-Handoff.md §5).
 *
 * The UI adapts per role within the same shell — nav items hide/scope based on
 * role rather than being separate apps. These are the display labels for the
 * four UI role buckets; the real role comes from auth (mapBackendRole maps the
 * backend roles super_admin/admin/search_strategist/editor onto these). A Super
 * Admin can preview other roles via the profile "view as" switcher.
 */

export type Role = "super" | "admin" | "seo" | "editor";

export type RoleMeta = {
    id: Role;
    label: string;
    description: string;
    /** Mock user shown in the profile area for this role. */
    user: { name: string; email: string; avatar: string };
};

export const ROLES: Record<Role, RoleMeta> = {
    super: {
        id: "super",
        label: "Super Admin",
        description:
            "Full control — users, roles, integrations, billing, security, everything.",
        user: {
            name: "Sarah Whitfield",
            email: "sarah@wearenorthbound.com",
            avatar: "/images/avatar.png",
        },
    },
    admin: {
        id: "admin",
        label: "Admin",
        description:
            "Manage users, roles, integrations, and all content + SEO. No billing/security.",
        user: {
            name: "Marcus Bennett",
            email: "marcus@wearenorthbound.com",
            avatar: "/images/avatar-1.png",
        },
    },
    seo: {
        id: "seo",
        label: "Search Strategist",
        description:
            "SEO + AEO/GEO suites, research, AI tools, and content review / publish.",
        user: {
            name: "Priya Nair",
            email: "priya@wearenorthbound.com",
            avatar: "/images/avatar-2.png",
        },
    },
    editor: {
        id: "editor",
        label: "Editor",
        description:
            "Create and edit content, use AI tools and assets, submit for review.",
        user: {
            name: "Daniel Brooks",
            email: "daniel@wearenorthbound.com",
            avatar: "/images/avatar-3.png",
        },
    },
};

export const ROLE_ORDER: Role[] = ["super", "admin", "seo", "editor"];

export const DEFAULT_ROLE: Role = "super";

/**
 * Map a backend role (key + landing dashboard) to the UI's role buckets, so the
 * existing role-aware nav/dashboards keep working. Custom roles fall back by
 * their chosen dashboard.
 */
export function mapBackendRole(key: string, dashboard?: string | null): Role {
    switch (key) {
        case "super_admin":
            return "super";
        case "admin":
            return "admin";
        case "search_strategist":
            return "seo";
        case "editor":
            return "editor";
    }
    switch (dashboard) {
        case "overview":
            return "admin";
        case "seo":
        case "research":
            return "seo";
        default:
            return "editor";
    }
}
