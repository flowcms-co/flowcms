/**
 * Connector setup guides live in the developer docs (flowcms.co/developers/docs).
 * The user-facing Help Center (flowcms.co/help) covers day-to-day product use;
 * these technical connector guides live under the docs so each connector links
 * straight to its own page.
 */
export const HELP_BASE = "https://flowcms.co/developers/docs";

export const helpUrl = (slug: string) => `${HELP_BASE}/${slug.replace(/^\/+/, "")}`;

/** Per-connector guide slugs. */
export const GUIDES = {
    gsc: "integrations/search-console",
    ga4: "integrations/google-analytics",
    pagespeed: "integrations/pagespeed",
    keyword: "integrations/keyword-data",
    serper: "integrations/serper",
    dataforseo: "integrations/dataforseo",
    aiProvider: "integrations/ai-providers",
} as const;
