-- Replace the NULL-prone unique with a non-null target discriminator.
ALTER TABLE "PageAudit" ADD COLUMN "target" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PageAudit" ALTER COLUMN "target" DROP DEFAULT;
DROP INDEX "PageAudit_workspaceId_entryId_url_task_key";
CREATE UNIQUE INDEX "PageAudit_workspaceId_target_task_key" ON "PageAudit"("workspaceId", "target", "task");
