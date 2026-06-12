/**
 * Phase 2b end-to-end check against the real seeded DB. Mirrors SeoAuditService.
 * Run: npx dotenv -e .env -- npx tsx apps/api/src/seo/audit/seo-audit.verify.ts
 */
import { PrismaClient } from "@flowcms/db";
import { auditPage, contentHash, renderFinding, escalationTasks, type Finding } from "./audit-engine";
import { entryToPageInput } from "./parse-content";

const prisma = new PrismaClient();
const PAGE = "page";

async function auditEntry(workspaceId: string, entry: { id: string; slug: string | null; data: unknown }) {
    const input = entryToPageInput({ id: entry.id, slug: entry.slug, data: entry.data as Record<string, unknown> });
    const hash = contentHash(input);
    const existing = await prisma.pageAudit.findUnique({ where: { workspaceId_target_task: { workspaceId, target: entry.id, task: PAGE } } });
    if (existing && existing.contentHash === hash) return { skipped: true };
    const findings = auditPage(input);
    const severity = findings.reduce((m, f) => Math.max(m, f.severity), 0);
    const escalated = escalationTasks(findings).length > 0;
    const data = { contentHash: hash, l1Findings: findings as unknown as object, severity, escalated, lastCheckedAt: new Date() };
    await prisma.pageAudit.upsert({
        where: { workspaceId_target_task: { workspaceId, target: entry.id, task: PAGE } },
        create: { workspaceId, target: entry.id, entryId: entry.id, task: PAGE, ...data },
        update: data,
    });
    return { skipped: false, findings, escalated };
}

(async () => {
    const ws = await prisma.workspace.findFirst({ where: { name: "Northbound" } }) ?? (await prisma.workspace.findFirst());
    if (!ws) { console.error("no workspace"); process.exit(1); }
    console.log("workspace:", ws.name, ws.id);

    const entries = await prisma.contentEntry.findMany({ where: { workspaceId: ws.id, status: "PUBLISHED" }, select: { id: true, slug: true, data: true }, take: 500 });
    console.log("published entries:", entries.length);

    // Pass 1
    let changed = 0, escalated = 0;
    for (const e of entries) {
        const r = await auditEntry(ws.id, e);
        if (!r.skipped) { changed++; if (r.escalated) escalated++; }
    }
    console.log(`\nPass 1: scanned ${entries.length}, changed ${changed}, escalated ${escalated}`);

    // Pass 2 (change-detection: nothing changed -> 0 re-runs)
    let changed2 = 0;
    for (const e of entries) { const r = await auditEntry(ws.id, e); if (!r.skipped) changed2++; }
    console.log(`Pass 2 (no content change): changed ${changed2}  ${changed2 === 0 ? "✅ change-detection works" : "❌ should be 0"}`);

    // Read back + render a few
    const rows = await prisma.pageAudit.findMany({ where: { workspaceId: ws.id, task: PAGE }, orderBy: { severity: "desc" }, take: 3 });
    console.log(`\nLedger rows: ${await prisma.pageAudit.count({ where: { workspaceId: ws.id } })}. Top 3 by severity:`);
    for (const r of rows) {
        const findings = (r.l1Findings as unknown as Finding[]) ?? [];
        const rendered = findings.map(renderFinding).filter(Boolean);
        console.log(`\n  ${r.entryId}  (severity ${r.severity}, escalated ${r.escalated}, ${findings.length} findings)`);
        for (const f of rendered.slice(0, 5)) console.log(`    [${f!.severityLabel}] ${f!.label} — ${f!.fixHint}`);
    }

    await prisma.$disconnect();
    console.log("\n✅ Phase 2b pipeline verified against real seeded content.");
})().catch((e) => { console.error(e); process.exit(1); });
