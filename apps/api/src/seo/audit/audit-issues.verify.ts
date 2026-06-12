/**
 * Verification harness for the SEO issue grouping (the AI Optimizer backbone).
 * Pure, no infra. Run: `npx tsx apps/api/src/seo/audit/audit-issues.verify.ts`
 */
import { renderFinding } from "./audit-engine";
import { SEO_CODES, lookupCode } from "./seo-codes";
import { buildIssues, categoryOf, effortOf, fixKindOf, type PageRow, type SiteFinding } from "./audit-issues";

let failures = 0;
const assert = (c: boolean, m: string) => { if (!c) { failures++; console.error(`  ✗ FAIL: ${m}`); } else console.log(`  ✓ ${m}`); };

function rendered(code: string, values?: Record<string, string | number>) {
    const c = lookupCode(code)!;
    return renderFinding({ code, task: c.task, severity: c.severity, values })!;
}

console.log("[new codes exist + render]");
for (const code of ["AIREADY_LLMS_MISSING", "AIREADY_ROBOTS_MISSING", "AIREADY_SITEMAP_MISSING", "SCHEMA_FAQ_MISSING", "SCHEMA_ORG_MISSING", "CANNIBALIZATION", "INTERNAL_LINK_OPP"]) {
    assert(!!SEO_CODES[code], `${code} is in the codebook`);
    assert(!!rendered(code), `${code} renders`);
}

console.log("\n[taxonomy mapping]");
assert(categoryOf("META_DESC_MISSING", "meta_title_description") === "metadata", "meta -> metadata");
assert(categoryOf("AIREADY_LLMS_MISSING", "technical_diagnosis") === "readiness", "readiness override beats technical task");
assert(categoryOf("SCHEMA_FAQ_MISSING", "schema_audit") === "schema", "faq -> schema");
assert(categoryOf("CANNIBALIZATION", "gsc_ga_analysis") === "cannibalization", "cannibalization override");
assert(categoryOf("INTERNAL_LINK_OPP", "onpage_seo_audit") === "links", "internal-link -> links");
assert(effortOf("META_DESC_MISSING") === "easy", "meta is easy");
assert(effortOf("CWV_LCP_POOR") === "hard", "CWV is hard");
assert(fixKindOf("META_DESC_MISSING", "fix").kind === "meta", "meta -> meta modal");
assert(fixKindOf("SCHEMA_FAQ_MISSING", "fix").kind === "faq", "faq -> faq modal");
assert(fixKindOf("AIREADY_LLMS_MISSING", "none").kind === "file" && fixKindOf("AIREADY_LLMS_MISSING", "none").arg === "llms", "llms -> file gen (llms)");
assert(fixKindOf("AIREADY_SITEMAP_MISSING", "none").arg === "sitemap", "sitemap -> file gen (sitemap)");
assert(fixKindOf("THIN_CONTENT", "fix").kind === "editor", "thin content -> editor");
assert(fixKindOf("CWV_LCP_POOR", "explain").kind === "instructions", "CWV -> instructions");
assert(fixKindOf("INTERNAL_LINK_OPP", "none").kind === "links", "internal link -> links apply");

console.log("\n[buildIssues grouping]");
const pageRows: PageRow[] = [
    { entryId: "a", url: "/a", title: "A", findings: [rendered("META_DESC_MISSING"), rendered("H1_MISSING")] },
    { entryId: "b", url: "/b", title: "B", findings: [rendered("META_DESC_MISSING")] },
    { entryId: "c", url: "/c", title: "C", findings: [] },
];
const site: SiteFinding[] = [
    { finding: rendered("AIREADY_LLMS_MISSING") },
    { finding: rendered("CANNIBALIZATION", { kw: "2 queries" }), count: 2, pages: [{ id: null, url: "/x", title: "/x" }, { id: null, url: "/y", title: "/y" }] },
];
const res = buildIssues(pageRows, site, 72);

const metaGroup = res.groups.find((g) => g.key === "META_DESC_MISSING");
assert(!!metaGroup && metaGroup.count === 2 && metaGroup.pages.length === 2, "meta desc grouped across 2 pages");
assert(metaGroup!.scope === "page", "meta desc is page-scope");
const llms = res.groups.find((g) => g.key === "AIREADY_LLMS_MISSING");
assert(!!llms && llms.scope === "site", "llms is site-scope");
const cannib = res.groups.find((g) => g.key === "CANNIBALIZATION");
assert(!!cannib && cannib.count === 2, "cannibalization count from site finding");
assert(res.counts.clean === 1, "one clean page (C)");
assert(res.counts.pages === 3, "three pages scanned");
assert(res.score === 72, "score passed through");
assert(res.categories.some((c) => c.key === "metadata") && res.categories.some((c) => c.key === "readiness"), "categories include metadata + readiness");
assert(res.quickWins.length > 0 && res.quickWins.every((q) => q.fix !== "instructions"), "quick wins are fixable (no instruction-only)");
// Quick wins favour easy effort.
assert(res.quickWins[0].effort === "easy", "top quick win is easy effort");

console.log(`\n${failures === 0 ? "✅ ALL ASSERTIONS PASSED" : `❌ ${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
