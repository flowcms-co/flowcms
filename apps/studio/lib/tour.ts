import type { Role } from "@/lib/roles";

/**
 * Guided tour content model. Each screen owns a short "chapter" that auto-plays
 * the first time the user lands there (and can be replayed from the compass in
 * the top bar). Steps can spotlight a DOM target and can declare an integration
 * prerequisite, which the tour card renders as a live connected/not-connected
 * pill with a Connect CTA, so the tour doubles as a setup reminder: email for
 * invites, an AI key for AI tools, Search Console for SEO data, and so on.
 */

/** Connection keys the tour can check live (useConnections + useMailStatus). */
export type TourRequirementKey =
    | "ai"
    | "email"
    | "gsc"
    | "ga4"
    | "pagespeed"
    | "keyword"
    | "aeo"
    | "backlinks";

export type TourRequirement = {
    /** Satisfied when ANY of these is connected (e.g. GA4 or an AEO connector). */
    anyOf: TourRequirementKey[];
    /** Short label for the status pill, e.g. "Email (SMTP)". */
    label: string;
    /** What stays off until it's connected. Shown only while disconnected. */
    note: string;
    /** Where to connect it (an integrations settings tab). */
    href: string;
    cta: string;
};

export type TourStep = {
    id: string;
    /** CSS selector to spotlight. Omit (or fail to match) for a centered card. */
    target?: string;
    title: string;
    /** Optional emoji rendered after the title (openers only, keeps copy clean). */
    emoji?: string;
    body: string;
    /** Optional one-line pro tip rendered in a highlighted box under the body. */
    tip?: string;
    /** Optional icon feature rows (icon square + title + one-liner). */
    features?: { icon: string; title: string; body: string }[];
    requires?: TourRequirement;
    /** Roles that see this step. Omit = everyone who sees the chapter. */
    roles?: Role[];
};

export type TourChapter = {
    id: string;
    /** Route (pathname only) that activates this chapter. */
    route: string;
    /** Where the launcher navigates to start it, when the route alone isn't
     *  enough (e.g. a specific sub-tab via query string). Defaults to route. */
    launchHref?: string;
    /** "prefix" also matches sub-routes; more specific chapters win. */
    match?: "exact" | "prefix";
    icon: string;
    /** Full-bleed illustration for the chapter's opener card (public/ path).
     *  Chapters without one fall back to their SVG spot scene on a tinted panel. */
    image?: string;
    title: string;
    /** One-liner shown in the launcher list. */
    blurb: string;
    roles?: Role[];
    steps: TourStep[];
};

export function requirementMet(
    req: TourRequirement,
    connected: Record<TourRequirementKey, boolean>,
): boolean {
    return req.anyOf.some((key) => connected[key]);
}

/** The most specific chapter whose route matches the pathname, if any. */
export function chapterForPath(chapters: TourChapter[], pathname: string): TourChapter | null {
    let best: TourChapter | null = null;
    for (const c of chapters) {
        const hit =
            c.route === "/"
                ? pathname === "/"
                : c.match === "exact"
                  ? pathname === c.route
                  : pathname === c.route || pathname.startsWith(c.route + "/");
        if (hit && (!best || c.route.length > best.route.length)) best = c;
    }
    return best;
}

/** Chapters (and steps) visible to a role. */
export function chaptersForRole(role: Role): TourChapter[] {
    return TOUR_CHAPTERS.filter((c) => !c.roles || c.roles.includes(role)).map((c) => ({
        ...c,
        steps: c.steps.filter((s) => !s.roles || s.roles.includes(role)),
    }));
}

const CONNECT = {
    ai: {
        anyOf: ["ai"] as TourRequirementKey[],
        label: "AI provider",
        href: "/settings/integrations?tab=ai",
        cta: "Connect AI provider",
    },
    email: {
        anyOf: ["email"] as TourRequirementKey[],
        label: "Email (SMTP)",
        href: "/settings/integrations?tab=email",
        cta: "Connect SMTP",
    },
    gsc: {
        anyOf: ["gsc"] as TourRequirementKey[],
        label: "Search Console",
        href: "/settings/integrations?tab=analytics",
        cta: "Connect Search Console",
    },
};

export const TOUR_CHAPTERS: TourChapter[] = [
    {
        id: "overview",
        route: "/",
        icon: "overview",
        image: "/tour/overview.webp",
        title: "Welcome",
        blurb: "The lay of the land: navigation, search and shortcuts.",
        steps: [
            {
                id: "welcome",
                title: "Welcome to FlowCMS",
                emoji: "👋",
                body: "This guided tour walks you through each screen as you visit it, one short chapter at a time.",
                tip: "Use the buttons or your arrow keys to navigate.",
                features: [
                    {
                        icon: "compass",
                        title: "Compass replay",
                        body: "Replay any chapter from the compass in the top bar.",
                    },
                    {
                        icon: "grid",
                        title: "Keyboard friendly",
                        body: "Arrow keys move between steps, Esc skips.",
                    },
                ],
            },
            {
                id: "sidebar",
                target: '[data-tour="sidebar-nav"]',
                title: "Seven sections, one shell",
                body: "Overview, Content, SEO, AI Tools, Assets, Chat and Settings. The menu adapts to your role, so teammates only see what they can act on.",
            },
            {
                id: "search",
                target: 'button[aria-label="Search everything"]',
                title: "Find anything in a keystroke",
                emoji: "⚡",
                body: "Entries, assets, settings and screens, all one search away.",
                tip: "Press Cmd K (Ctrl K on Windows) from anywhere in the studio.",
            },
            {
                id: "new-content",
                target: 'a[aria-label="New content"]',
                title: "Start writing in one click",
                body: "This opens the block editor with a fresh draft. It saves automatically, so you can start rough.",
                tip: "Required fields are only enforced when you publish, never while drafting.",
            },
            {
                id: "notifications",
                target: 'button[aria-label="Notifications"]',
                title: "Never miss a beat",
                body: "Publishes, approvals, mentions and system events land here the moment they happen.",
            },
            {
                id: "compass",
                target: '[data-tour="topbar-tour"]',
                title: "Your tour compass",
                emoji: "🧭",
                body: "Chapter progress lives here, along with a setup checklist that shows which integrations still need connecting so every feature works.",
                tip: "Finished chapters get a green check. Replay any of them whenever you like.",
            },
        ],
    },
    {
        id: "content",
        route: "/content",
        image: "/tour/content.webp",
        icon: "document",
        title: "Content",
        blurb: "The content table, filters and the publishing lifecycle.",
        steps: [
            {
                id: "lifecycle",
                title: "A safe publishing lifecycle",
                emoji: "🛡️",
                body: "Entries move through Draft, In review, Approved, Scheduled and Published. Nothing goes live by accident.",
                tip: "Drafts can be incomplete. Required fields are only enforced at publish time.",
                features: [
                    {
                        icon: "edit",
                        title: "Draft over published",
                        body: "Editing a live entry stages a pending draft; your site keeps serving the published version.",
                    },
                    {
                        icon: "clock",
                        title: "Scheduled publishing",
                        body: "Pick a date and a background job publishes on time.",
                    },
                ],
            },
            {
                id: "table",
                target: "#tour-content-overview",
                title: "Your content at a glance",
                emoji: "📄",
                body: "Drafts, scheduled and live entries side by side, with status, SEO score and freshness for each one.",
                tip: "Select multiple rows to publish, unpublish or delete in bulk.",
            },
            {
                id: "queue",
                target: 'a[href="/content/queue"]',
                title: "Set it and forget it",
                emoji: "⏰",
                body: "Scheduled entries publish themselves on time. A background scheduler handles the rest, and fires your webhooks when it does.",
            },
            {
                id: "quality",
                target: 'a[href="/content/quality"]',
                title: "Know what to improve next",
                body: "A running audit of your content: readability, freshness and SEO health, ranked so the biggest wins come first.",
            },
        ],
    },
    {
        id: "editor",
        route: "/content/editor",
        image: "/tour/editor.webp",
        icon: "edit",
        title: "Block editor",
        blurb: "Blocks, live SEO scoring and the publish workflow.",
        steps: [
            {
                id: "intro",
                title: "Where writing feels light",
                emoji: "🪶",
                body: "Blocks, live SEO scoring and a safe publish flow, all in one canvas.",
                features: [
                    {
                        icon: "edit",
                        title: "Block writing",
                        body: "Type / for blocks, drag handles to reorder, autosaves as you go.",
                    },
                    {
                        icon: "chart",
                        title: "Live SEO score",
                        body: "Scoring and readability signals update while you write.",
                    },
                    {
                        icon: "check",
                        title: "Safe publishing",
                        body: "Review, schedule or publish when it's ready.",
                    },
                ],
            },
            {
                id: "title",
                target: 'input[aria-label="Title"]',
                title: "Name it, the slug follows",
                body: "The URL slug is derived from the title until you customize it. The status pill next to it always tells you what the world can see.",
            },
            {
                id: "canvas",
                target: '[data-tour="editor-canvas"]',
                title: "Write without friction",
                emoji: "✍️",
                body: "Blocks snap together as you write, and everything autosaves as you go.",
                tip: "Type / for the block menu, select text for the inline toolbar, drag the left handle to reorder.",
            },
            {
                id: "tools",
                target: 'button[aria-label="Toggle panel"]',
                title: "Your co-pilot panel",
                body: "This toggle opens the tools panel: a live SEO score, meta fields and readability signals that update as you write.",
                requires: {
                    ...CONNECT.ai,
                    note: "AI rewrite and suggestions in this panel unlock once an AI provider is connected.",
                },
            },
            {
                id: "preview",
                target: 'button[title="Open live preview"]',
                title: "See it live",
                body: "Preview renders your real site. With the live-edit bridge installed on your front end, you can click text on the page and edit it in place.",
            },
            {
                id: "publish",
                target: '[data-tour="editor-actions"]',
                title: "Publish with confidence",
                body: "Submit for review, schedule for later, or publish now, depending on your role and the workspace's approval rules.",
                tip: "Scheduling picks a date; a background job publishes on time.",
            },
        ],
    },
    {
        id: "seo",
        route: "/seo",
        image: "/tour/seo.webp",
        icon: "chart",
        title: "SEO",
        blurb: "The deterministic score, reports and the AI Optimizer.",
        roles: ["super", "admin", "seo"],
        steps: [
            {
                id: "reports",
                title: "Your whole SEO picture",
                emoji: "📈",
                body: "Keywords, top pages, cannibalization, internal links and more each open a full report from their dashboard card.",
                requires: {
                    ...CONNECT.gsc,
                    note: "Keyword, ranking and top-page cards stay locked until Google Search Console is connected. It also gives FlowCMS your site URL, which vitals, audits and file checks depend on.",
                },
            },
            {
                id: "score",
                target: "#tour-seo-score",
                title: "One score, zero guesswork",
                emoji: "🎯",
                body: "Same inputs, same score, no black box. Pillars whose data source is not connected redistribute their weight, so the score stays honest either way.",
            },
            {
                id: "aeo",
                target: '[data-tour="seo-aeo"]',
                title: "AI search and backlinks",
                emoji: "📡",
                body: "These two cards track how ChatGPT, Perplexity and AI Overviews send you traffic, and who links to you.",
                requires: {
                    anyOf: ["ga4", "aeo", "backlinks"],
                    label: "GA4 or a data connector",
                    note: "These cards light up once GA4 or a dedicated AEO/backlinks connector is connected.",
                    href: "/settings/integrations?tab=analytics",
                    cta: "Connect analytics",
                },
            },
            {
                id: "optimizer",
                target: 'a[href="/seo/optimizer"]',
                title: "Fixes that write themselves",
                emoji: "🔧",
                body: "The AI Optimizer scans your site, groups the issues and proposes fixes. Open it for its own chapter of the tour.",
                requires: {
                    ...CONNECT.ai,
                    note: "AI-written fixes (meta tags, schema, sitemap files) need an AI provider connected.",
                },
            },
        ],
    },
    {
        id: "optimizer",
        route: "/seo/optimizer",
        icon: "chart",
        image: "/tour/optimizer.webp",
        title: "AI Optimizer",
        blurb: "Scan your site, review the issues, apply fixes.",
        roles: ["super", "admin", "seo"],
        steps: [
            {
                id: "intro",
                title: "Your SEO mechanic",
                emoji: "🔧",
                body: "The Optimizer finds what's holding your pages back, then does the tedious part for you.",
                features: [
                    {
                        icon: "search",
                        title: "Scan",
                        body: "Crawls your published pages and grades every issue.",
                    },
                    {
                        icon: "eye",
                        title: "Review",
                        body: "See each suggested fix and its impact before it lands.",
                    },
                    {
                        icon: "sparkles",
                        title: "Fix",
                        body: "Apply one by one, in batches, or auto-apply the safe ones.",
                    },
                ],
            },
            {
                id: "run",
                target: '[data-tour="opt-run"]',
                title: "Start with a scan",
                emoji: "🔍",
                body: "Run audit crawls your published pages and rebuilds the issue list. Run it again anytime; the numbers show what changed since last time.",
            },
            {
                id: "stats",
                target: '[data-tour="opt-stats"]',
                title: "Read the damage report",
                body: "Pages audited, issues found, how many AI can fix on its own, and how many pages are already clean.",
            },
            {
                id: "fixmode",
                target: "#tour-opt-fixmode",
                title: "Choose how fixes apply",
                body: "Review first shows you every suggestion before it touches your site. Auto-apply safe lets deterministic, low-risk fixes land on their own.",
                tip: "Deterministic checks are free. AI-written fixes route by your plan.",
                requires: {
                    ...CONNECT.ai,
                    note: "AI-written fixes (meta tags, schema, file generation) need an AI provider connected.",
                },
            },
            {
                id: "issues",
                target: '[data-tour="opt-issues"] > *:first-child',
                title: "Work the list",
                body: "Issues are grouped by category with impact and effort labels. Fix a single page, a whole group, or a category at once.",
                tip: "Ignore an issue and it stays out of your score until you bring it back.",
            },
        ],
    },
    {
        id: "ai",
        route: "/ai",
        image: "/tour/ai.webp",
        icon: "sparkles",
        title: "AI Tools",
        blurb: "Generate drafts, proofread, and teach the AI your voice.",
        steps: [
            {
                id: "intro",
                title: "Your AI toolkit",
                emoji: "✨",
                body: "Draft, proofread, refresh and brief with your own AI keys.",
                features: [
                    {
                        icon: "sparkles",
                        title: "Content generator",
                        body: "Full drafts with tone, length and keywords.",
                    },
                    {
                        icon: "check",
                        title: "Proofreading",
                        body: "Grammar, style and originality in one pass.",
                    },
                    {
                        icon: "wallet",
                        title: "Metered and budgeted",
                        body: "Real token costs on every call, spend caps on Pro.",
                    },
                ],
            },
            {
                id: "generator",
                target: '[data-tour="ai-generator"]',
                title: "Draft with your own AI",
                body: "Describe what you need, pick tone, length and keywords, and generate a draft with the real token cost shown. AI output is a starting point: always review before publishing.",
                requires: {
                    ...CONNECT.ai,
                    note: "Bring your own key from any of 19 providers, from OpenAI and Anthropic to a local Ollama. Keys are encrypted and never leave the server.",
                },
            },
            {
                id: "proofreading",
                target: 'a[href="/ai/proofreading"]',
                title: "Polish before you publish",
                body: "Grammar, style and originality checks in one pass.",
                tip: "Standard mode works without any AI key at all.",
            },
            {
                id: "brain",
                target: 'a[href="/ai/knowledge"]',
                title: "Teach it to sound like you",
                emoji: "🧠",
                body: "The Brain feeds your facts, tone and rules into every AI action, so output sounds like you. Matching is rule based and reproducible, not a vector black box.",
                roles: ["super", "admin", "seo"],
            },
            {
                id: "refresh",
                target: 'a[href="/ai/refresh"]',
                title: "Freshen stale content",
                body: "A queue of entries going stale, ready for an AI-assisted update pass.",
            },
            {
                id: "usage",
                target: 'a[href="/ai/usage"]',
                title: "Spend with your eyes open",
                body: "Every AI call is metered with real token costs. Model routing picks a sensible model per task, and budgets can cap spend before it happens.",
            },
        ],
    },
    {
        id: "assets",
        route: "/assets",
        image: "/tour/assets.webp",
        icon: "folder",
        title: "Assets",
        blurb: "The media library, AI alt text and page templates.",
        steps: [
            {
                id: "alt-text",
                title: "A library that works for you",
                emoji: "🖼️",
                body: "Every upload gets a thumbnail, metadata and AI alt text, good for accessibility and image SEO in one move.",
                requires: {
                    ...CONNECT.ai,
                    note: "Automatic alt text needs a vision-capable AI provider connected.",
                },
            },
            {
                id: "upload",
                target: '[data-tour="assets-upload"]',
                title: "Drop files anywhere",
                body: "Upload here or drag files straight onto the grid. Thumbnails and metadata are handled for you.",
                tip: "Production installs should serve media from object storage (S3, R2 or Supabase).",
            },
            {
                id: "templates",
                target: 'a[href="/assets/templates"]',
                title: "Start from a template",
                body: "Reusable page layouts your team can build on, so new pages ship consistent.",
            },
        ],
    },
    {
        id: "chat",
        route: "/chat",
        image: "/tour/chat.webp",
        icon: "chat",
        title: "Chat",
        blurb: "Team conversations, right next to the work.",
        steps: [
            {
                id: "channels",
                title: "Talk where the work is",
                emoji: "💬",
                body: "No context switching: your team's conversations live right next to the content.",
                features: [
                    {
                        icon: "chat",
                        title: "Channels and threads",
                        body: "Organize by team, project or campaign.",
                    },
                    {
                        icon: "document",
                        title: "Share entries",
                        body: "Paste an entry link and it's one click away for everyone.",
                    },
                ],
            },
            {
                id: "new-channel",
                target: 'button[aria-label="New channel"]',
                title: "Spin up a channel",
                emoji: "➕",
                body: "One per team, project or campaign. Give it a short kebab-case name and press Enter.",
            },
            {
                id: "mentions",
                target: '[data-tour="chat-composer"]',
                title: "Pull people in with @",
                body: "Type @ and a teammate's name; pick them from the popup and they get a notification.",
                tip: "Enter sends the message, Shift Enter adds a new line.",
            },
        ],
    },
    {
        id: "team",
        route: "/settings/workspace",
        image: "/tour/team.webp",
        launchHref: "/settings/workspace?tab=team",
        icon: "users",
        title: "Team",
        blurb: "Invites, roles and what invites need to actually send.",
        roles: ["super", "admin"],
        steps: [
            {
                id: "roles",
                title: "Four roles out of the box",
                emoji: "🧭",
                body: "Everyone gets a studio tailored to their job, nothing more, nothing less.",
                features: [
                    {
                        icon: "users",
                        title: "Built-in roles",
                        body: "Super Admin, Admin, Search Strategist and Editor.",
                    },
                    {
                        icon: "lock",
                        title: "Custom roles",
                        body: "Granular and field-level permissions, on Pro.",
                    },
                ],
            },
            {
                id: "invite",
                target: '[data-tour="team-invite"]',
                title: "Invite your team",
                body: "Add teammates with an email, a temporary password and a role. Their account exists immediately.",
                requires: {
                    ...CONNECT.email,
                    note: "The invite email only goes out once SMTP is connected. Until then, share the temporary password with them yourself. Password resets need SMTP too.",
                },
            },
            {
                id: "goals",
                target: '[data-tour="team-goal"]',
                title: "Set the pace",
                emoji: "🎯",
                body: "The default weekly writing goal every editor starts with. Their dashboard tracks progress against it.",
                tip: "Tune the goal per person from the edit icon on their row.",
            },
            {
                id: "permissions",
                target: '[data-tour-tab="roles"]',
                title: "Tune permissions",
                body: "The Roles tab shows exactly what each role can do: workspace, content, SEO and AI, collaboration.",
                tip: "On Pro you can build custom roles with granular and field-level permissions, and pick each role's default dashboard.",
            },
        ],
    },
    {
        id: "security",
        route: "/settings/security",
        icon: "lock",
        image: "/tour/security.webp",
        title: "Security",
        blurb: "Two-factor auth, the audit log and access controls.",
        steps: [
            {
                id: "intro",
                title: "Lock the doors",
                emoji: "🔐",
                body: "Everything that keeps your workspace safe lives on this screen.",
                features: [
                    {
                        icon: "lock",
                        title: "Two-factor authentication",
                        body: "A second step at sign-in, per account.",
                    },
                    {
                        icon: "document",
                        title: "Audit log",
                        body: "Every sensitive action, on the record.",
                    },
                    {
                        icon: "key",
                        title: "Enterprise access",
                        body: "SSO, SCIM provisioning and IP policies.",
                    },
                ],
            },
            {
                id: "2fa",
                target: "#tour-2fa",
                title: "Two-factor, two minutes",
                emoji: "📱",
                body: "Scan the QR with any authenticator app, confirm a code, and save your backup codes somewhere safe.",
                tip: "Anyone can set this up for their own account, no admin needed.",
            },
            {
                id: "audit",
                target: '[data-tour="security-audit"]',
                title: "Every action, on the record",
                body: "Sign-ins, role changes, publishes and security events, searchable and timestamped.",
                tip: "Pro adds CSV and SIEM export for long-term retention.",
                roles: ["super"],
            },
            {
                id: "enterprise",
                target: '[data-tour="security-enterprise"]',
                title: "Enterprise access controls",
                body: "Single sign-on via OIDC, SCIM user provisioning from your identity provider, and IP allow-lists.",
                roles: ["super"],
            },
        ],
    },
    {
        id: "content-model",
        route: "/settings/content",
        icon: "grid",
        image: "/tour/content-model.webp",
        title: "Content model",
        blurb: "Types, reusable components, references and locales.",
        roles: ["super", "admin"],
        steps: [
            {
                id: "intro",
                title: "Model your content",
                emoji: "🧱",
                body: "Define the shape of everything you publish, no code required.",
                tip: "Live preview URL lives under Settings → Workspace → System; set it to power the editor's Site mode.",
                features: [
                    {
                        icon: "document",
                        title: "Content types",
                        body: "Collections for many entries, singles for one-offs, each with a page type for routing.",
                    },
                    {
                        icon: "grid",
                        title: "Reusable components",
                        body: "Field groups you define once and nest anywhere, single or repeatable.",
                    },
                    {
                        icon: "external",
                        title: "References",
                        body: "Link entries to each other, forward and mapped-by.",
                    },
                ],
            },
            {
                id: "toggle",
                target: '[data-tour="schema-toggle"]',
                title: "Types and components",
                body: "Flip between your content types and the reusable components they're built from. Change a component once and every type using it updates.",
            },
            {
                id: "list",
                target: "#tour-schema-list",
                title: "Your building blocks",
                body: "Every type in the workspace with its field count. Pick one to edit its fields, drag to reorder them.",
            },
            {
                id: "new",
                target: '[data-tour="schema-new"]',
                title: "Create a type",
                body: "Name it and the apiId is derived for you. Pick a page type for routing, then add fields: text, rich text, media, references, page builder.",
                tip: "A Page builder field lets editors stack and reorder your approved components.",
            },
            {
                id: "localization",
                target: '[data-tour-tab="localization"]',
                title: "Speak every language",
                emoji: "🌍",
                body: "Add locales to the workspace and every entry can carry a translation per locale.",
            },
            {
                id: "import",
                target: '[data-tour-tab="import"]',
                title: "Bring content with you",
                body: "Import from WordPress, Strapi, Contentful, Sanity, Markdown or CSV, with a preview before anything is written.",
            },
        ],
    },
    {
        id: "integrations",
        route: "/settings/integrations",
        icon: "settings",
        image: "/tour/integrations.webp",
        title: "Integrations",
        blurb: "The power strip: connect once, unlock features everywhere.",
        roles: ["super", "admin"],
        steps: [
            {
                id: "intro",
                title: "The power strip",
                emoji: "🔌",
                body: "Most locked cards around the studio unlock on this screen. Connect a source once and every feature that depends on it lights up.",
                features: [
                    {
                        icon: "sparkles",
                        title: "AI providers",
                        body: "Generator, rewrite, alt text and optimizer fixes.",
                    },
                    {
                        icon: "chart",
                        title: "Analytics and search data",
                        body: "Search Console, GA4, keyword and vitals connectors.",
                    },
                    {
                        icon: "mail",
                        title: "Email (SMTP)",
                        body: "Invites, password resets and alert emails.",
                    },
                ],
            },
            {
                id: "ai-tab",
                target: '[data-tour-tab="ai"]',
                title: "AI unlocks the smartest tools",
                emoji: "✨",
                body: "This tab holds your provider keys: the content generator, in-editor AI, optimizer fixes, alt text and quick suggestions all run on them.",
                requires: {
                    ...CONNECT.ai,
                    note: "No AI provider is connected yet, so those tools are waiting.",
                },
            },
            {
                id: "analytics-tab",
                target: '[data-tour-tab="analytics"]',
                title: "Search Console feeds the SEO engine",
                body: "Connect Search Console here for keywords and rankings (it also tells FlowCMS your site URL), plus GA4, PageSpeed and keyword-data connectors.",
                requires: {
                    ...CONNECT.gsc,
                    note: "Connect Search Console to unlock live SEO data across the studio.",
                },
            },
            {
                id: "automation-tab",
                target: '[data-tour-tab="automation"]',
                title: "Tell the other tools",
                body: "Slack and Zapier connectors relay content events, publishes, updates and schedules, to wherever your team lives.",
                tip: "Zapier is free on every plan; Slack notifications come with Pro.",
            },
            {
                id: "email-tab",
                target: '[data-tour-tab="email"]',
                title: "Email makes invites work",
                emoji: "✉️",
                body: "SMTP lives here. Team invites, password resets and alert emails all send through it, and silently stay put without it.",
                requires: {
                    ...CONNECT.email,
                    note: "SMTP is not connected yet, so no email leaves this workspace.",
                },
            },
        ],
    },
    {
        id: "developers",
        route: "/settings/developers",
        image: "/tour/developers.webp",
        icon: "key",
        title: "Developers",
        blurb: "Tokens, webhooks and connecting your front end.",
        roles: ["super", "admin"],
        steps: [
            {
                id: "tokens",
                title: "Three token types",
                emoji: "🔑",
                body: "Every integration with your site starts with the right token for the job.",
                tip: "Treat write tokens like production credentials: scope them tightly and rotate them.",
                features: [
                    {
                        icon: "document",
                        title: "Content token",
                        body: "Reads published entries. Safe for your public front end.",
                    },
                    {
                        icon: "eye",
                        title: "Preview token",
                        body: "Unlocks drafts. Keep it server side.",
                    },
                    {
                        icon: "key",
                        title: "Agent token",
                        body: "Writes content, scoped per action.",
                    },
                ],
            },
            {
                id: "api-keys",
                target: '[data-tour-tab="api-keys"]',
                title: "Mint tokens here",
                emoji: "🔑",
                body: "Create Content tokens for your front end, Preview tokens for drafts, and scoped Agent tokens for writes. Revoke any of them with one click.",
                tip: "The token value shows once at creation, copy it then.",
            },
            {
                id: "webhooks",
                target: '[data-tour-tab="webhooks"]',
                title: "Webhooks keep your site fresh",
                emoji: "⚡",
                body: "Add an endpoint and FlowCMS calls it on create, update, publish, schedule, unpublish and delete, each delivery HMAC signed.",
                tip: "Pair one with your framework's revalidation and published changes appear instantly.",
            },
            {
                id: "api-docs",
                target: '[data-tour-tab="api-docs"]',
                title: "Docs and the 60-second connect",
                emoji: "🚀",
                body: "OpenAPI docs for every endpoint, plus a copy-paste quickstart that wires your site to the delivery API with one token and one snippet.",
            },
        ],
    },
];
