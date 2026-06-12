/**
 * Flow CMS — AI model chooser / auto-router (Phase 1).
 *
 * Pure routing logic (no Nest/Prisma deps). Given a task, a tier, and the
 * customer's runtime context (which provider keys are connected, free-quota
 * state, page metadata), it returns the ORDERED list of models to try. The
 * executor walks the list with backoff so a mid-run 429 / provider blip falls
 * through to the next candidate instead of failing the page.
 *
 * See docs/AI-AUTOMATION-PLAN.md for the full design + the task x tier matrix.
 */

import {
    MODEL_REGISTRY,
    TASK_REQUIRES_VISION,
    TIER_PLANS,
    type ModelConfig,
    type ModelId,
    type Preference,
    type SeoTask,
    type Tier,
    type TierPlan,
} from "./model-tiers";

export interface RouteContext {
    /** Integration.provider values that are CONNECTED for this workspace. */
    connectedProviders: string[];
    /** Per-model free-quota availability (best-effort daily counter). Missing => assume available. */
    quotaAvailable?: Partial<Record<ModelId, boolean>>;
    /** When true, paid models are skipped (e.g. monthly AI budget hit). */
    budgetExhausted?: boolean;
    /** Page metadata for context-aware overrides. */
    pageType?: "post" | "page" | "category" | "tag" | "archive" | "pagination" | "landing";
    contentPriority?: "standard" | "cornerstone" | "premium";
    wordCount?: number;
    batchSize?: number;
}

export interface ChosenModel extends ModelConfig {
    /** Why this candidate was selected (debug / UI). */
    reason: string;
    /** True when picked because free quota was available (cost = $0 for this call). */
    free: boolean;
}

export interface RouteResult {
    task: SeoTask;
    tier: Tier;
    /** The model to use first. */
    primary: ChosenModel;
    /** Full ordered fallback chain (primary first). */
    candidates: ChosenModel[];
}

export class NoProviderForTaskError extends Error {
    constructor(
        public readonly task: SeoTask,
        public readonly tier: Tier,
    ) {
        super(`NO_PROVIDER_FOR_TASK: ${task} on tier ${tier}`);
        this.name = "NoProviderForTaskError";
    }
}

export function taskRequiresVision(task: SeoTask): boolean {
    return TASK_REQUIRES_VISION[task];
}

const BULK_PAGE_TYPES = new Set(["category", "tag", "archive", "pagination"]);
/** Cheapest-first text chain used to downgrade bulk/low-value pages off a premium default. */
const CHEAP_TEXT_CHAIN: ModelId[] = ["deepseek-v4-flash", "llama-4-scout", "gemini-2.5-flash", "claude-haiku-4.5"];

/** De-dup key: a model can appear once as free-quota and once as paid (e.g. Gemini
 *  Flash is free first, then a paid overflow), so the key includes the freeOnly flag. */
function prefKey(pref: Preference): string {
    return `${pref.model}:${pref.freeOnly ? "free" : "paid"}`;
}

function dedupPrefs(prefs: Preference[]): Preference[] {
    const seen = new Set<string>();
    const out: Preference[] = [];
    for (const pref of prefs) {
        const k = prefKey(pref);
        if (!seen.has(k)) {
            seen.add(k);
            out.push(pref);
        }
    }
    return out;
}

/** Build the ordered preference list for a task+tier, including the fallback tier's list. */
function buildPreferences(task: SeoTask, tier: Tier): Preference[] {
    const out: Preference[] = [];
    let cursor: Tier | undefined = tier;
    // Walk this tier then its fallback chain (3 -> 2 -> 1).
    while (cursor) {
        const plan: TierPlan = TIER_PLANS[cursor];
        out.push(...plan.tasks[task]);
        cursor = plan.fallbackTier;
    }
    return dedupPrefs(out);
}

/** Apply context-aware overrides by re-shaping the preference list (prepend wins, gates still apply). */
function applyOverrides(task: SeoTask, tier: Tier, ctx: RouteContext, prefs: Preference[]): Preference[] {
    const prepend: ModelId[] = [];

    // Content quality where it counts: cornerstone/premium -> Opus (T3), short-form -> Haiku (T2+).
    if (task === "content_generation") {
        if (tier === 3 && (ctx.contentPriority === "cornerstone" || ctx.contentPriority === "premium")) {
            prepend.push("claude-opus-4.6");
        }
        if (tier >= 2 && typeof ctx.wordCount === "number" && ctx.wordCount < 200) {
            prepend.push("claude-haiku-4.5");
        }
    }

    // Meta on bulk/low-value pages -> cheapest capable text model (don't spend premium).
    if (task === "meta_title_description" && tier >= 2 && ctx.pageType && BULK_PAGE_TYPES.has(ctx.pageType)) {
        prepend.push(...CHEAP_TEXT_CHAIN);
    }

    // Per-page technical fix instructions (single page) -> cheap reasoning before the site-wide 2M model.
    if (task === "technical_diagnosis" && tier === 3 && (ctx.batchSize ?? 1) <= 1) {
        prepend.push("deepseek-v4-pro", "claude-sonnet-4.6");
    }

    if (!prepend.length) return prefs;
    // Insert the override models AFTER any leading free-quota entries, so $0 Gemini
    // still wins first on free-first tasks, while content (no leading free entries)
    // gets the override at the very front.
    let i = 0;
    while (i < prefs.length && prefs[i].freeOnly) i++;
    const head = prefs.slice(0, i);
    const tail = prefs.slice(i);
    return dedupPrefs([...head, ...prepend.map((model) => ({ model })), ...tail]);
}

/** Resolve a preference to the effective model id, honouring a batch-size override. */
function effectiveModel(pref: Preference, ctx: RouteContext): ModelId {
    if (pref.batchThreshold !== undefined && pref.batchOverride && (ctx.batchSize ?? 0) > pref.batchThreshold) {
        return pref.batchOverride;
    }
    return pref.model;
}

/** Can this model run, given connection / vision / quota / budget? Returns the candidate or a skip reason. */
function gate(
    modelId: ModelId,
    pref: Preference,
    task: SeoTask,
    ctx: RouteContext,
): { ok: true; candidate: ChosenModel } | { ok: false; why: string } {
    const model = MODEL_REGISTRY[modelId];
    if (!model) return { ok: false, why: "unknown model" };

    // 1. provider must be connected
    if (!ctx.connectedProviders.includes(model.provider)) return { ok: false, why: `${model.provider} not connected` };

    // 2. (no consent gate — connecting the key is the consent)

    // 3. vision: skip non-vision models for image tasks
    if (taskRequiresVision(task) && !model.vision) return { ok: false, why: "no vision" };

    // 4. free quota: a freeOnly preference is only usable while quota remains
    const freeOnly = pref.freeOnly === true;
    const quotaOk = ctx.quotaAvailable?.[modelId] ?? true; // missing => assume available
    if (freeOnly && !quotaOk) return { ok: false, why: "free quota exhausted" };

    const usingFree = freeOnly && quotaOk;

    // 5. budget: when the paid budget is exhausted, only free usage is allowed
    if (!usingFree && ctx.budgetExhausted) return { ok: false, why: "budget exhausted" };

    const reason = usingFree
        ? "free quota"
        : model.note
          ? `cheapest capable (${model.note})`
          : "cost/quality fit";
    return { ok: true, candidate: { ...model, reason, free: usingFree } };
}

/**
 * Choose the model(s) for a task on a tier. Returns the primary + the full ordered
 * fallback chain. Throws NoProviderForTaskError when nothing is connected/usable
 * (caller decides: Community -> queue/retry next day; Pro/Enterprise -> prompt to add a key).
 */
export function chooseModel(task: SeoTask, tier: Tier, ctx: RouteContext): RouteResult {
    const prefs = applyOverrides(task, tier, ctx, buildPreferences(task, tier));

    const candidates: ChosenModel[] = [];
    const seen = new Set<ModelId>();
    for (const pref of prefs) {
        // Evaluate the batch-effective model first, then the base, so a missing
        // override provider gracefully falls back to the base preference.
        const ids = [effectiveModel(pref, ctx), pref.model];
        for (const id of ids) {
            if (seen.has(id)) continue;
            const res = gate(id, pref, task, ctx);
            if (res.ok) {
                seen.add(id);
                candidates.push(res.candidate);
                break; // this preference yielded a candidate; move to the next preference
            }
        }
    }

    if (!candidates.length) throw new NoProviderForTaskError(task, tier);
    return { task, tier, primary: candidates[0], candidates };
}

/**
 * Map ANY CMS AI feature string to the routing task whose cost/capability class
 * fits it, so the unified AI gateway routes every tool through the tier chooser.
 *
 * Total (never null): unknown features fall back to the content (premium-anchored)
 * class, matching the old "default to strong" behaviour. The task ids are an
 * INTERNAL routing identity (a cost/capability bucket), not user-facing SEO labels:
 *   - meta_title_description = short mechanical text -> cheapest capable text model
 *   - schema_audit          = structured-data reasoning
 *   - onpage_seo_audit      = text analysis -> cheap reasoning
 *   - image_alt_tag         = vision-required
 *   - content_generation    = long-form / creative -> premium-anchored
 */
export function taskForFeature(feature: string): SeoTask {
    switch (feature) {
        // vision
        case "ai.alt":
        case "media.alt_text":
            return "image_alt_tag";
        // short mechanical text -> cheapest capable
        case "ai.meta":
        case "seo.meta_fix":
        case "ai.links":
            return "meta_title_description";
        // structured data
        case "seo.schema_fix":
            return "schema_audit";
        // text analysis -> cheap reasoning
        case "ai.grammar":
        case "ai.plagiarism":
            return "onpage_seo_audit";
        // long-form / creative / reasoning -> premium-anchored
        case "content.generate":
        case "ai.refresh":
        case "ai.brand_voice":
        case "ai.brief":
        case "seo.memory_refine":
        case "seo.llms_txt":
        case "seo.aeo_probe":
            return "content_generation";
        default:
            return "content_generation";
    }
}
