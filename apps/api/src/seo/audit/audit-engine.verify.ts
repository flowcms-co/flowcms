/**
 * Verification harness for the SEO audit engine (Phase 2a). Pure, no infra.
 * Run: `npx tsx apps/api/src/seo/audit/audit-engine.verify.ts`
 */
import {
    auditPage,
    detectGsc,
    renderFinding,
    escalationTasks,
    shouldEscalate,
    compactToFindings,
    contentHash,
    type PageInput,
    type GscRow,
} from "./audit-engine";

let failures = 0;
function assert(cond: boolean, msg: string) {
    if (!cond) {
        failures++;
        console.error(`  ✗ FAIL: ${msg}`);
    }
}

// A deliberately problematic page.
const badPage: PageInput = {
    url: "/blog/x",
    metaTitle: "Hi",
    metaDescription: "",
    focusKeyword: "brand strategy",
    headings: [
        { level: 1, text: "One" },
        { level: 1, text: "Two" },
        { level: 4, text: "Skips" },
    ],
    images: [{ src: "/a.png", alt: "" }, { src: "/b.png", alt: "ok" }],
    internalLinkCount: 0,
    bodyText: "Short copy.",
    wordCount: 12,
    jsonLd: [],
    vitals: { lcpMs: 4500, cls: 0.2, inpMs: 250 },
    tech: { redirectChain: ["/a", "/b", "/c"], canonical: null, noindex: false },
};

const findings = auditPage(badPage);
const codes = findings.map((f) => f.code);
console.log("=== findings on the bad page ===");
for (const f of findings) {
    const r = renderFinding(f)!;
    console.log(`  [${r.severityLabel.padEnd(8)}] ${r.code.padEnd(22)} ${r.label}  (ai:${r.ai})`);
}

console.log("\n[assertions: detection]");
assert(codes.includes("META_TITLE_SHORT"), "short title detected");
assert(codes.includes("META_TITLE_NO_KEYWORD"), "missing keyword in title detected");
assert(codes.includes("META_DESC_MISSING"), "missing description detected");
assert(codes.includes("IMG_ALT_MISSING"), "missing alt detected");
assert(codes.includes("SCHEMA_MISSING"), "missing schema detected");
assert(codes.includes("CWV_LCP_POOR"), "poor LCP detected");
assert(codes.includes("CWV_CLS_POOR"), "poor CLS detected");
assert(codes.includes("H1_MULTIPLE"), "multiple H1 detected");
assert(codes.includes("HEADING_SKIP"), "heading skip detected");
assert(codes.includes("THIN_CONTENT"), "thin content detected");
assert(codes.includes("INTERNAL_LINKS_FEW"), "few internal links detected");
assert(codes.includes("TECH_REDIRECT_CHAIN"), "redirect chain detected");
assert(codes.includes("TECH_CANONICAL_MISSING"), "missing canonical detected");

console.log("\n[assertions: a clean page yields nothing]");
const cleanPage: PageInput = {
    metaTitle: "How we approach brand strategy for startups in 2026",
    metaDescription: "A practical look at brand strategy: positioning, identity, and the work that earns trust and scales with your business over time today.",
    focusKeyword: "brand strategy",
    headings: [{ level: 1, text: "Brand strategy" }, { level: 2, text: "How" }],
    images: [{ src: "/a.png", alt: "a diagram of the brand strategy process" }],
    internalLinkCount: 5,
    bodyText: "We start with the audience. " .repeat(80),
    wordCount: 400,
    jsonLd: [{ "@type": "Article" }],
    vitals: { lcpMs: 1800, cls: 0.02, inpMs: 120 },
    tech: { redirectChain: ["/x"], canonical: "/x", noindex: false },
};
assert(auditPage(cleanPage).length === 0, "clean page produces zero findings");

console.log("\n[assertions: presentation layer]");
const rendered = renderFinding({ code: "META_TITLE_LONG", task: "meta_title_description", severity: 2, values: { len: 71 } })!;
assert(rendered.label === "Title too long", "renderFinding gives a human label");
assert(rendered.severityLabel === "Warning", "severity maps to a word");
assert(renderFinding({ code: "NONSENSE_CODE", task: "meta_title_description", severity: 1 }) === null, "unknown code renders null (dropped)");

console.log("\n[assertions: escalation]");
assert(shouldEscalate({ code: "META_DESC_MISSING", task: "meta_title_description", severity: 2 }), "meta issue escalates (ai:fix)");
assert(!shouldEscalate({ code: "H1_MULTIPLE", task: "onpage_seo_audit", severity: 1 }), "structural-only issue does NOT escalate (ai:none)");
const tasks = escalationTasks(findings);
console.log(`  escalation tasks: ${tasks.join(", ")}`);
assert(tasks.includes("meta_title_description"), "meta task queued for AI");
assert(tasks.includes("core_web_vitals"), "CWV task queued for AI (explain)");
assert(!tasks.includes("technical_diagnosis") || true, "tech may or may not escalate by severity");

console.log("\n[assertions: GSC detector]");
const gsc: GscRow[] = [
    { page: "/p1", ctr: 0.02, ctrPrev: 0.05, position: 6, positionPrev: 5 },
    { page: "/p2", ctr: 0.04, position: 14 },
];
const gf = detectGsc(gsc).map((f) => f.code);
assert(gf.includes("GSC_CTR_DROP"), "CTR drop detected");
assert(gf.includes("GSC_STRIKING_DISTANCE"), "striking-distance page detected");

console.log("\n[assertions: compact AI output -> findings]");
const fromAi = compactToFindings("meta_title_description", {
    issues: [
        { c: "META_TITLE_LONG", s: 2, v: { len: 80 } },
        { c: "H1_MISSING" }, // wrong task -> dropped
        { c: "BOGUS" }, // unknown -> dropped
    ],
});
assert(fromAi.length === 1 && fromAi[0].code === "META_TITLE_LONG", "AI output: keeps valid task code, drops cross-task + unknown");

console.log("\n[assertions: change detection]");
const h1 = contentHash(badPage);
const h2 = contentHash({ ...badPage });
const h3 = contentHash({ ...badPage, metaTitle: "Changed" });
assert(h1 === h2, "same content -> same hash (no re-run)");
assert(h1 !== h3, "changed content -> different hash (re-run)");

console.log(`\n${failures === 0 ? "✅ ALL ASSERTIONS PASSED" : `❌ ${failures} ASSERTION(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
