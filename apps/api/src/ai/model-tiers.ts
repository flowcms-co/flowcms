/**
 * Flow CMS — AI model tiers + registry (Phase 1 of the SEO Automation Engine).
 *
 * Pure config + data, no Nest/Prisma deps, so it's unit-testable and shareable.
 * The router (`model-chooser.ts`) consumes this.
 *
 * Design (see docs/AI-AUTOMATION-PLAN.md):
 *  - Tier = the workspace's license edition (community=1, pro=2, enterprise=3).
 *  - Each task has an ORDERED preference list per tier. The router walks it and
 *    returns the connected/capable candidates in order, so it degrades gracefully
 *    when a provider isn't connected.
 *  - COST-FIRST ordering: free Gemini quota -> cheapest capable connected model
 *    (DeepSeek / Llama) -> mid (Gemini Flash / Claude Haiku) -> premium ONLY where
 *    it differentiates (content quality = ranking; Gemini 3.1 Pro's 2M context).
 *    Customers with only Google+Anthropic still get the reference matrix; adding a
 *    cheap key (DeepSeek/Groq) auto-routes cheaper for like-for-like tasks.
 *  - No consent gate: connecting a provider key IS the consent (China-hosted is a
 *    UI label only). Vision gate stays (DeepSeek/Llama skip image tasks).
 *  - Model ids are config; update them as providers release/rename.
 */

export type Tier = 1 | 2 | 3;

/** The 8 SEO tasks the platform performs. */
export type SeoTask =
    | "image_alt_tag"
    | "meta_title_description"
    | "schema_audit"
    | "core_web_vitals"
    | "onpage_seo_audit"
    | "content_generation"
    | "gsc_ga_analysis"
    | "technical_diagnosis";

export const SEO_TASKS: SeoTask[] = [
    "image_alt_tag",
    "meta_title_description",
    "schema_audit",
    "core_web_vitals",
    "onpage_seo_audit",
    "content_generation",
    "gsc_ga_analysis",
    "technical_diagnosis",
];

/** Only image work needs a vision/multimodal model. */
export const TASK_REQUIRES_VISION: Record<SeoTask, boolean> = {
    image_alt_tag: true,
    meta_title_description: false,
    schema_audit: false,
    core_web_vitals: false,
    onpage_seo_audit: false,
    content_generation: false,
    gsc_ga_analysis: false,
    technical_diagnosis: false,
};

export type ModelId =
    | "gemini-2.5-flash-lite"
    | "gemini-2.5-flash"
    | "gemini-3.1-pro"
    | "claude-haiku-4.5"
    | "claude-sonnet-4.6"
    | "claude-opus-4.6"
    | "deepseek-v4-flash"
    | "deepseek-v4-pro"
    | "llama-4-scout";

export interface ModelConfig {
    id: ModelId;
    /** Matches Integration.provider so availability reuses the connected list. */
    provider: "gemini" | "anthropic" | "deepseek" | "groq";
    label: string;
    vision: boolean;
    /** Present => the model has a free quota tier (daily request cap). */
    freeQuota?: { perDay: number };
    /** Approx cost of the PAID portion, USD per million tokens. */
    cost: { inPerM: number; outPerM: number };
    /** Large-context models (e.g. 2M) are a real differentiator for site-wide tasks. */
    contextTokens?: number;
    /** Less reliable at strict structured output (Llama) — informs ordering, not a gate. */
    structuredReliable?: boolean;
    /** UI-only note (e.g. data residency). NOT a routing gate. */
    note?: string;
}

export const MODEL_REGISTRY: Record<ModelId, ModelConfig> = {
    "gemini-2.5-flash-lite": {
        id: "gemini-2.5-flash-lite",
        provider: "gemini",
        label: "Gemini 2.5 Flash-Lite",
        vision: true,
        freeQuota: { perDay: 1000 },
        cost: { inPerM: 0.075, outPerM: 0.3 },
        structuredReliable: true,
    },
    "gemini-2.5-flash": {
        id: "gemini-2.5-flash",
        provider: "gemini",
        label: "Gemini 2.5 Flash",
        vision: true,
        freeQuota: { perDay: 250 },
        cost: { inPerM: 0.3, outPerM: 0.3 },
        structuredReliable: true,
    },
    "gemini-3.1-pro": {
        id: "gemini-3.1-pro",
        provider: "gemini",
        label: "Gemini 3.1 Pro",
        vision: true,
        cost: { inPerM: 2, outPerM: 12 },
        contextTokens: 2_000_000,
        structuredReliable: true,
    },
    "claude-haiku-4.5": {
        id: "claude-haiku-4.5",
        provider: "anthropic",
        label: "Claude Haiku 4.5",
        vision: true,
        cost: { inPerM: 1, outPerM: 5 },
        structuredReliable: true,
    },
    "claude-sonnet-4.6": {
        id: "claude-sonnet-4.6",
        provider: "anthropic",
        label: "Claude Sonnet 4.6",
        vision: true,
        cost: { inPerM: 3, outPerM: 15 },
        structuredReliable: true,
    },
    "claude-opus-4.6": {
        id: "claude-opus-4.6",
        provider: "anthropic",
        label: "Claude Opus 4.6",
        vision: true,
        cost: { inPerM: 5, outPerM: 25 },
        structuredReliable: true,
    },
    "deepseek-v4-flash": {
        id: "deepseek-v4-flash",
        provider: "deepseek",
        label: "DeepSeek V4 Flash",
        vision: false,
        cost: { inPerM: 0.14, outPerM: 0.28 },
        structuredReliable: true,
        note: "China-hosted",
    },
    "deepseek-v4-pro": {
        id: "deepseek-v4-pro",
        provider: "deepseek",
        label: "DeepSeek V4 Pro",
        vision: false,
        cost: { inPerM: 0.435, outPerM: 0.87 },
        structuredReliable: true,
        note: "China-hosted",
    },
    "llama-4-scout": {
        id: "llama-4-scout",
        provider: "groq",
        label: "Llama 4 Scout (Groq)",
        vision: false,
        cost: { inPerM: 0.15, outPerM: 0.15 },
        // Open weights, cheapest text, but less reliable for strict structured output.
        structuredReliable: false,
    },
};

/** One step in a task's ordered preference list. */
export interface Preference {
    model: ModelId;
    /** Only usable while the model's free daily quota remains. */
    freeOnly?: boolean;
    /** If ctx.batchSize > this, swap to batchOverride (e.g. site-wide -> 2M-context model). */
    batchThreshold?: number;
    batchOverride?: ModelId;
}

export interface TierPlan {
    tier: Tier;
    label: string;
    /** Community is free-only: never routes to a paid model; queues if quota is out. */
    freeOnly: boolean;
    /** When this tier's list is exhausted, also consider this lower tier's list. */
    fallbackTier?: Tier;
    tasks: Record<SeoTask, Preference[]>;
}

// --- shorthands ---
const free = (model: ModelId): Preference => ({ model, freeOnly: true });
const p = (model: ModelId): Preference => ({ model });

/** Free Gemini, used first on every task (both tiers that allow paid still try free first). */
const GEMINI_FREE: Preference[] = [free("gemini-2.5-flash"), free("gemini-2.5-flash-lite")];

export const TIER_PLANS: Record<Tier, TierPlan> = {
    // -------- Tier 1: Community (free only, $0 always) --------
    1: {
        tier: 1,
        label: "Community",
        freeOnly: true,
        tasks: {
            image_alt_tag: [...GEMINI_FREE],
            meta_title_description: [...GEMINI_FREE],
            schema_audit: [...GEMINI_FREE],
            core_web_vitals: [...GEMINI_FREE],
            onpage_seo_audit: [...GEMINI_FREE],
            content_generation: [...GEMINI_FREE],
            gsc_ga_analysis: [...GEMINI_FREE],
            technical_diagnosis: [...GEMINI_FREE],
        },
    },

    // -------- Tier 2: Pro (free-first, then cheapest capable, premium where it matters) --------
    2: {
        tier: 2,
        label: "Pro",
        freeOnly: false,
        fallbackTier: 1,
        tasks: {
            // vision: cheap text models can't help; Gemini Flash is the cheap vision option.
            image_alt_tag: [...GEMINI_FREE, p("gemini-2.5-flash"), p("claude-haiku-4.5")],
            // simple short text -> cheapest text models first.
            meta_title_description: [...GEMINI_FREE, p("deepseek-v4-flash"), p("llama-4-scout"), p("gemini-2.5-flash")],
            // structured reasoning -> DeepSeek Pro (cheap + smart), Gemini Flash fallback.
            schema_audit: [...GEMINI_FREE, p("deepseek-v4-pro"), p("gemini-2.5-flash")],
            core_web_vitals: [...GEMINI_FREE, p("deepseek-v4-flash"), p("gemini-2.5-flash")],
            onpage_seo_audit: [...GEMINI_FREE, p("deepseek-v4-pro"), p("claude-haiku-4.5")],
            // content quality = ranking: premium only (no cheap). Short-form -> Haiku via override.
            content_generation: [p("claude-sonnet-4.6")],
            gsc_ga_analysis: [...GEMINI_FREE, p("deepseek-v4-pro"), p("gemini-2.5-flash")],
            technical_diagnosis: [
                ...GEMINI_FREE,
                p("deepseek-v4-pro"),
                { model: "claude-haiku-4.5", batchThreshold: 50, batchOverride: "gemini-2.5-flash" },
            ],
        },
    },

    // -------- Tier 3: Enterprise (never queues; flagship/large-context where it differentiates) --------
    3: {
        tier: 3,
        label: "Enterprise",
        freeOnly: false,
        fallbackTier: 2,
        tasks: {
            image_alt_tag: [...GEMINI_FREE, p("gemini-2.5-flash"), p("claude-haiku-4.5")],
            meta_title_description: [...GEMINI_FREE, p("deepseek-v4-flash"), p("llama-4-scout"), p("claude-sonnet-4.6")],
            schema_audit: [...GEMINI_FREE, p("deepseek-v4-pro"), p("claude-sonnet-4.6")],
            // site-wide CWV wants 2M context; per-page is cheap. Big batch -> Gemini 3.1 Pro.
            core_web_vitals: [
                ...GEMINI_FREE,
                { model: "deepseek-v4-flash", batchThreshold: 50, batchOverride: "gemini-3.1-pro" },
                p("gemini-3.1-pro"),
            ],
            onpage_seo_audit: [...GEMINI_FREE, p("deepseek-v4-pro"), p("claude-sonnet-4.6")],
            // content: premium anchor; cornerstone/premium -> Opus via override.
            content_generation: [p("claude-sonnet-4.6")],
            // GSC/GA over 6-12 months wants the 2M-context model.
            gsc_ga_analysis: [
                ...GEMINI_FREE,
                { model: "deepseek-v4-pro", batchThreshold: 50, batchOverride: "gemini-3.1-pro" },
                p("gemini-3.1-pro"),
            ],
            // site-wide diagnosis -> 2M context; per-page fix -> cheap reasoning.
            technical_diagnosis: [
                ...GEMINI_FREE,
                { model: "deepseek-v4-pro", batchThreshold: 50, batchOverride: "gemini-3.1-pro" },
                p("gemini-3.1-pro"),
            ],
        },
    },
};

/**
 * The registry ids are our stable ROUTING identity (forward-dated per the brief).
 * This maps each to the provider's CURRENT wire model string so the executor works
 * against real keys today. Update these as providers ship the named versions.
 */
export const API_MODEL: Record<ModelId, string> = {
    "gemini-2.5-flash-lite": "gemini-2.0-flash-lite",
    "gemini-2.5-flash": "gemini-2.0-flash",
    "gemini-3.1-pro": "gemini-1.5-pro",
    "claude-haiku-4.5": "claude-3-5-haiku-latest",
    "claude-sonnet-4.6": "claude-3-5-sonnet-latest",
    "claude-opus-4.6": "claude-3-opus-latest",
    "deepseek-v4-flash": "deepseek-chat",
    "deepseek-v4-pro": "deepseek-reasoner",
    "llama-4-scout": "llama-3.3-70b-versatile",
};

export function apiModelFor(id: ModelId): string {
    return API_MODEL[id] ?? id;
}

/** Map the license plan string to a numeric tier. */
export function tierForPlan(plan: string | null | undefined): Tier {
    if (plan === "enterprise") return 3;
    if (plan === "pro") return 2;
    return 1; // community / unknown
}
