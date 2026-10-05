-- When the live page was last actually requested (as opposed to re-checked from
-- stored facts). Drives incremental runs and the rolling background re-check.
ALTER TABLE "PageAudit" ADD COLUMN "fetchedAt" TIMESTAMP(3);
UPDATE "PageAudit" SET "fetchedAt" = "lastCheckedAt" WHERE "task" = 'page' AND "live"->>'status' = '200';
CREATE INDEX "PageAudit_workspaceId_task_fetchedAt_idx" ON "PageAudit"("workspaceId", "task", "fetchedAt");

-- The crawl rate now adapts: it starts at seoCrawlRps and may rise to this while
-- the site stays healthy.
ALTER TABLE "Workspace" ADD COLUMN "seoCrawlMaxRps" DOUBLE PRECISION NOT NULL DEFAULT 10;
-- Every page is re-verified against the live site within this many days.
ALTER TABLE "Workspace" ADD COLUMN "seoRecheckDays" INTEGER NOT NULL DEFAULT 14;
