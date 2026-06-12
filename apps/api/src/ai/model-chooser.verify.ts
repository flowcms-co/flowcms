/**
 * Verification harness for the model chooser (Phase 1). Pure, no infra.
 * Run: `npx tsx apps/api/src/ai/model-chooser.verify.ts`
 *
 * Prints the task x tier matrix for the default provider set (Google + Anthropic),
 * shows how it shifts when cheap keys (DeepSeek + Groq) are added, and asserts the
 * gates/overrides. Exits non-zero on any failed assertion.
 */
import { chooseModel, NoProviderForTaskError, type RouteContext } from "./model-chooser";
import { SEO_TASKS, type SeoTask, type Tier } from "./model-tiers";

let failures = 0;
function assert(cond: boolean, msg: string) {
    if (!cond) {
        failures++;
        console.error(`  ✗ FAIL: ${msg}`);
    }
}

const baseCtx = (over: Partial<RouteContext> = {}): RouteContext => ({
    connectedProviders: ["gemini", "anthropic"],
    quotaAvailable: {},
    ...over,
});

function primary(task: SeoTask, tier: Tier, ctx: RouteContext): string {
    try {
        return chooseModel(task, tier, ctx).primary.id;
    } catch (e) {
        if (e instanceof NoProviderForTaskError) return "(none → queue/prompt)";
        throw e;
    }
}

function printMatrix(title: string, ctx: RouteContext) {
    console.log(`\n=== ${title} ===`);
    const pad = (s: string, n: number) => s.padEnd(n);
    console.log(pad("task", 24) + pad("T1", 26) + pad("T2", 26) + "T3");
    for (const task of SEO_TASKS) {
        console.log(
            pad(task, 24) +
                pad(primary(task, 1, ctx), 26) +
                pad(primary(task, 2, ctx), 26) +
                primary(task, 3, ctx),
        );
    }
}

// ---- 1. Default providers (Google + Anthropic) → should match the brief's matrix ----
const dflt = baseCtx();
printMatrix("Default (gemini + anthropic), free quota available", dflt);

console.log("\n[assertions: default set]");
// Free-first everywhere quota allows
assert(primary("meta_title_description", 2, dflt) === "gemini-2.5-flash", "T2 meta uses free Gemini first");
assert(primary("content_generation", 2, dflt) === "claude-sonnet-4.6", "T2 content = Sonnet (quality)");
assert(primary("onpage_seo_audit", 3, dflt) === "gemini-2.5-flash", "T3 on-page free-first when quota available");
assert(primary("core_web_vitals", 3, dflt) === "gemini-2.5-flash", "T3 CWV free-first (single page)");

// ---- 2. Free quota exhausted → paid routing reveals the cost-first ladder ----
const noFree = baseCtx({ quotaAvailable: { "gemini-2.5-flash": false, "gemini-2.5-flash-lite": false } });
printMatrix("Quota exhausted (gemini + anthropic)", noFree);
console.log("\n[assertions: quota exhausted, default providers]");
assert(primary("meta_title_description", 2, noFree) === "gemini-2.5-flash", "T2 meta paid overflow = Gemini Flash (no DeepSeek connected)");
assert(primary("onpage_seo_audit", 2, noFree) === "claude-haiku-4.5", "T2 on-page paid = Haiku (no DeepSeek)");
assert(primary("schema_audit", 3, noFree) === "claude-sonnet-4.6", "T3 schema paid anchor = Sonnet (no DeepSeek)");
assert(primary("core_web_vitals", 3, noFree) === "gemini-3.1-pro", "T3 CWV paid = Gemini 3.1 Pro (2M ctx)");
assert(primary("content_generation", 1, noFree) === "(none → queue/prompt)", "T1 queues when free quota out");

// ---- 3. Cheap keys added (DeepSeek + Groq), quota exhausted → cheapest capable wins ----
const cheap = baseCtx({
    connectedProviders: ["gemini", "anthropic", "deepseek", "groq"],
    quotaAvailable: { "gemini-2.5-flash": false, "gemini-2.5-flash-lite": false },
});
printMatrix("Quota exhausted + DeepSeek/Groq connected", cheap);
console.log("\n[assertions: cheap providers connected]");
assert(primary("meta_title_description", 2, cheap) === "deepseek-v4-flash", "T2 meta → cheapest text (DeepSeek Flash)");
assert(primary("onpage_seo_audit", 2, cheap) === "deepseek-v4-pro", "T2 on-page → DeepSeek Pro over Haiku");
assert(primary("schema_audit", 3, cheap) === "deepseek-v4-pro", "T3 schema → DeepSeek Pro over Sonnet");
assert(primary("content_generation", 2, cheap) === "claude-sonnet-4.6", "content still Sonnet (cheap ≠ similar job)");
const altCheap = primary("image_alt_tag", 2, cheap);
assert(altCheap !== "deepseek-v4-flash" && altCheap !== "llama-4-scout", "alt skips DeepSeek/Llama (vision gate)");
assert(altCheap === "gemini-2.5-flash", "alt → cheapest VISION model (Gemini Flash, not Haiku)");

// ---- 4. Gates: vision, missing provider, consent-free ----
console.log("\n[assertions: gates]");
const onlyDeepseek = baseCtx({ connectedProviders: ["deepseek"], quotaAvailable: {} });
try {
    chooseModel("image_alt_tag", 2, onlyDeepseek);
    assert(false, "alt with only DeepSeek (no vision) should throw NO_PROVIDER");
} catch (e) {
    assert(e instanceof NoProviderForTaskError, "alt with only DeepSeek throws NoProviderForTaskError (vision gate)");
}
assert(
    chooseModel("meta_title_description", 2, onlyDeepseek).primary.id === "deepseek-v4-flash",
    "DeepSeek routes with no consent gate (key = consent)",
);

// ---- 5. Context overrides ----
console.log("\n[assertions: overrides]");
const corner = baseCtx({ contentPriority: "cornerstone", quotaAvailable: {} });
assert(primary("content_generation", 3, corner) === "claude-opus-4.6", "T3 cornerstone content → Opus");
const shortForm = baseCtx({ wordCount: 80 });
assert(primary("content_generation", 2, shortForm) === "claude-haiku-4.5", "T2 short-form content → Haiku");
const bulkMeta = baseCtx({ pageType: "category", quotaAvailable: { "gemini-2.5-flash": false, "gemini-2.5-flash-lite": false } });
assert(primary("meta_title_description", 3, bulkMeta) !== "claude-sonnet-4.6", "T3 bulk meta downgrades OFF Sonnet");
assert(primary("meta_title_description", 3, bulkMeta) === "gemini-2.5-flash", "T3 bulk meta (no cheap keys) → cheapest paid = Gemini Flash");
const siteWide = baseCtx({ batchSize: 200, quotaAvailable: { "gemini-2.5-flash": false, "gemini-2.5-flash-lite": false } });
assert(primary("technical_diagnosis", 3, siteWide) === "gemini-3.1-pro", "T3 site-wide tech (batch>50) → 2M-context Gemini Pro");

// ---- 6. Ranked fallback chain ----
console.log("\n[assertions: ranked candidates]");
const chain = chooseModel("meta_title_description", 2, cheap);
console.log(`  T2 meta chain: ${chain.candidates.map((c) => c.id).join(" → ")}`);
assert(chain.candidates.length >= 2, "returns a ranked fallback chain, not a single model");

console.log(`\n${failures === 0 ? "✅ ALL ASSERTIONS PASSED" : `❌ ${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
