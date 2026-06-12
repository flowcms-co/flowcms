/**
 * Phase 3 check: exercises the REAL SeoDripService.tick() + SeoAuditService against
 * the DB (no Nest lifecycle / timers). Run:
 *   npx dotenv -e .env -- npx tsx apps/api/src/seo/audit/seo-drip.verify.ts
 */
import { PrismaClient } from "@flowcms/db";
import { SeoAuditService } from "./seo-audit.service";
import { SeoDripService } from "./seo-drip.service";

const prisma = new PrismaClient();
const PAGE = "page";

let failures = 0;
const assert = (c: boolean, m: string) => { if (!c) { failures++; console.error(`  ✗ FAIL: ${m}`); } else console.log(`  ✓ ${m}`); };

(async () => {
    // SeoService + AssetsService are only used by issues()/generatePageAlt; the drip path doesn't need them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const audit = new SeoAuditService(prisma as any, null as any, null as any);
    // Redis stub: the verify script runs single-instance, so the lock always grants.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redisStub = { tryAcquire: async () => true } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drip = new SeoDripService(prisma as any, redisStub, audit);

    const ws = (await prisma.workspace.findFirst({ where: { name: "Northbound" } })) ?? (await prisma.workspace.findFirst());
    if (!ws) { console.error("no workspace"); process.exit(1); }
    const entry = await prisma.contentEntry.findFirst({ where: { workspaceId: ws.id, status: "PUBLISHED" } });
    if (!entry) { console.error("no published entry"); process.exit(1); }
    console.log("entry:", entry.id);

    // Make it STALE: delete its audit row (simulates never-audited / changed).
    await prisma.pageAudit.deleteMany({ where: { workspaceId: ws.id, target: entry.id, task: PAGE } });
    const before = await prisma.pageAudit.findUnique({ where: { workspaceId_target_task: { workspaceId: ws.id, target: entry.id, task: PAGE } } });
    assert(before === null, "page is stale (no audit row) before the tick");

    // Real drip tick — should detect the stale page and re-audit it.
    console.log("\nrunning drip.tick()...");
    await drip.tick();

    const after = await prisma.pageAudit.findUnique({ where: { workspaceId_target_task: { workspaceId: ws.id, target: entry.id, task: PAGE } } });
    assert(!!after, "drip re-audited the stale page (row recreated)");
    const firstChecked = after?.lastCheckedAt;

    // Second tick: nothing changed -> drip should NOT re-audit it (lastCheckedAt unchanged).
    await new Promise((r) => setTimeout(r, 50));
    console.log("running drip.tick() again (no change)...");
    await drip.tick();
    const after2 = await prisma.pageAudit.findUnique({ where: { workspaceId_target_task: { workspaceId: ws.id, target: entry.id, task: PAGE } } });
    assert(after2?.lastCheckedAt?.getTime() === firstChecked?.getTime(), "second tick skips the unchanged page (no wasted work)");

    await prisma.$disconnect();
    console.log(`\n${failures === 0 ? "✅ Phase 3 drip verified" : `❌ ${failures} FAILED`}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
