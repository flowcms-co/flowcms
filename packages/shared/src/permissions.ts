/**
 * Permission catalog + default system roles for Flow CMS.
 *
 * Roles are customizable: these are the seeded defaults. Super Admin/Admin can
 * clone, rename, or toggle individual permissions later. A role holding "*"
 * implicitly has every permission.
 */

export const PERMISSIONS = {
    // workspace / org
    WORKSPACE_MANAGE: "workspace.manage",
    USERS_MANAGE: "users.manage",
    ROLES_MANAGE: "roles.manage",
    INTEGRATIONS_MANAGE: "integrations.manage",
    BILLING_MANAGE: "billing.manage",
    SECURITY_MANAGE: "security.manage",
    APITOKENS_MANAGE: "apitokens.manage",
    WEBHOOKS_MANAGE: "webhooks.manage",
    // content
    CONTENT_READ: "content.read",
    CONTENT_CREATE: "content.create",
    CONTENT_UPDATE: "content.update",
    CONTENT_PUBLISH: "content.publish",
    CONTENT_DELETE: "content.delete",
    // media
    MEDIA_READ: "media.read",
    MEDIA_MANAGE: "media.manage",
    // seo + analytics
    SEO_READ: "seo.read",
    SEO_MANAGE: "seo.manage",
    ANALYTICS_READ: "analytics.read",
    // ai
    AI_USE: "ai.use",
    AI_MANAGE: "ai.manage",
    // knowledge / AI memory files
    KNOWLEDGE_MANAGE: "knowledge.manage",
    // collaboration
    CHAT_USE: "chat.use",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

export type SystemRole = {
    key: string;
    name: string;
    description: string;
    dashboard: "overview" | "seo" | "editor" | "research";
    /** "*" means all permissions. */
    permissions: string[];
};

export const SYSTEM_ROLES: SystemRole[] = [
    {
        key: "super_admin",
        name: "Super Admin",
        description: "Owner of the workspace. Full control, including billing and security.",
        dashboard: "overview",
        permissions: ["*"],
    },
    {
        key: "admin",
        name: "Admin",
        description: "Operations lead. Manages users, roles, integrations, and all content + SEO.",
        dashboard: "overview",
        permissions: [
            P.WORKSPACE_MANAGE,
            P.USERS_MANAGE,
            P.ROLES_MANAGE,
            P.INTEGRATIONS_MANAGE,
            P.APITOKENS_MANAGE,
            P.WEBHOOKS_MANAGE,
            P.CONTENT_READ,
            P.CONTENT_CREATE,
            P.CONTENT_UPDATE,
            P.CONTENT_PUBLISH,
            P.CONTENT_DELETE,
            P.MEDIA_MANAGE,
            P.SEO_READ,
            P.SEO_MANAGE,
            P.ANALYTICS_READ,
            P.AI_USE,
            P.AI_MANAGE,
            P.KNOWLEDGE_MANAGE,
            P.CHAT_USE,
        ],
    },
    {
        key: "search_strategist",
        name: "Search Strategist",
        description: "Owns SEO + AEO/GEO and research. Can review and publish content.",
        dashboard: "seo",
        permissions: [
            P.SEO_READ,
            P.SEO_MANAGE,
            P.ANALYTICS_READ,
            P.AI_USE,
            P.KNOWLEDGE_MANAGE,
            P.CONTENT_READ,
            P.CONTENT_UPDATE,
            P.CONTENT_PUBLISH,
            P.MEDIA_READ,
            P.CHAT_USE,
        ],
    },
    {
        key: "editor",
        name: "Editor",
        description: "Content team — creates and edits content and submits it for review.",
        dashboard: "editor",
        permissions: [
            P.CONTENT_READ,
            P.CONTENT_CREATE,
            P.CONTENT_UPDATE,
            P.MEDIA_MANAGE,
            P.AI_USE,
            P.CHAT_USE,
        ],
    },
];

/** Does a permission set grant a given permission? ("*" grants everything.) */
export function can(granted: string[] | undefined | null, permission: string): boolean {
    if (!granted) return false;
    return granted.includes("*") || granted.includes(permission);
}
