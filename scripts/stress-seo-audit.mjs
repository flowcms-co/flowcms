// Stress-test the AI Optimizer detectors + fixes against the seeded demo content.
// Signs in as admin, runs the audit, asserts every planted issue is detected, then
// exercises a representative fix (canonical) and re-checks it cleared. Read-only
// except the one canonical fix it applies (idempotent on re-run).
//
// Run (servers must be up): node scripts/stress-seo-audit.mjs
const API = process.env.API_BASE || "http://localhost:4000/api";

let cookie = "";
async function call(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    if (!res.ok) throw new Error(`${opts.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    return body;
}

const pass = [];
const fail = [];
const check = (name, ok, detail = "") => (ok ? pass : fail).push(`${name}${detail ? ` — ${detail}` : ""}`);

async function main() {
    await call("/auth/signin", { method: "POST", body: JSON.stringify({ email: "admin@flowcms.local", password: "changeme" }) });
    console.log("Signed in.");

    await call("/seo/scan/run", { method: "POST" });
    console.log("Audit run complete.");

    const issues = await call("/seo/scan/issues");
    const codes = new Set(issues.groups.map((g) => g.key));
    const byKey = Object.fromEntries(issues.groups.map((g) => [g.key, g]));
    console.log(`\nGroups detected (${issues.groups.length}): ${[...codes].sort().join(", ")}\n`);

    // --- assert each planted issue is detected ---
    check("Cannibalization", codes.has("CANNIBALIZATION"), byKey.CANNIBALIZATION ? `${byKey.CANNIBALIZATION.count} conflict(s), ${byKey.CANNIBALIZATION.pages.length} pages` : "");
    check("Duplicate content", codes.has("DUPLICATE_CONTENT"), byKey.DUPLICATE_CONTENT ? `${byKey.DUPLICATE_CONTENT.count} pages` : "");
    check("Missing canonical", codes.has("TECH_CANONICAL_MISSING"), byKey.TECH_CANONICAL_MISSING ? `${byKey.TECH_CANONICAL_MISSING.count} pages` : "");
    check("Poor headings (multiple H1)", codes.has("H1_MULTIPLE"));
    check("Heading skip", codes.has("HEADING_SKIP"));
    check("Meta description missing", codes.has("META_DESC_MISSING"));
    check("Meta description too long", codes.has("META_DESC_LONG"));
    check("Meta title too short", codes.has("META_TITLE_SHORT"));
    check("Title keyword absent", codes.has("META_TITLE_NO_KEYWORD"));
    check("Thin content", codes.has("THIN_CONTENT"));
    check("Few internal links", codes.has("INTERNAL_LINKS_FEW"));

    // --- cannibalization payload shape (groups + recommendation) ---
    const cg = byKey.CANNIBALIZATION;
    if (cg) {
        const grouped = cg.pages.filter((p) => p.group);
        check("Cannibalization pages carry a group keyword", grouped.length === cg.pages.length, `${grouped.length}/${cg.pages.length}`);
        const hasRec = cg.pages.some((p) => (p.detail || "").includes("compete"));
        check("Cannibalization includes a recommendation", hasRec);
    }

    // --- internal-link opportunities endpoint ---
    const il = await call("/seo/internal-links");
    check("Internal-link opportunities found", (il.opportunities?.length ?? 0) > 0, `${il.opportunities?.length ?? 0} ops`);

    // --- exercise a fix: set a missing canonical, re-audit, confirm it clears for that page ---
    const tc = byKey.TECH_CANONICAL_MISSING;
    const target = tc?.pages.find((p) => p.id);
    if (target) {
        await call(`/entries/${target.id}`, { method: "PATCH", body: JSON.stringify({ data: { canonical: target.url || "/fixed" } }) });
        await call("/seo/scan/run", { method: "POST" });
        const after = await call("/seo/scan/issues");
        const stillMissing = (after.groups.find((g) => g.key === "TECH_CANONICAL_MISSING")?.pages ?? []).some((p) => p.id === target.id);
        check("Canonical fix cleared after re-audit", !stillMissing, `page ${target.title}`);
    } else {
        check("Canonical fix", false, "no managed page to fix");
    }

    // --- report ---
    console.log("\n==== RESULTS ====");
    console.log(`PASS (${pass.length}):`);
    pass.forEach((p) => console.log(`  ✓ ${p}`));
    if (fail.length) {
        console.log(`\nFAIL (${fail.length}):`);
        fail.forEach((f) => console.log(`  ✗ ${f}`));
        process.exitCode = 1;
    } else {
        console.log("\nAll checks passed.");
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
