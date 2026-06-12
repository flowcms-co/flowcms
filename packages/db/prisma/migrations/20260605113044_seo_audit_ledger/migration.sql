-- CreateTable
CREATE TABLE "PageAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entryId" TEXT,
    "url" TEXT,
    "task" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "l1Findings" JSONB NOT NULL DEFAULT '[]',
    "l2Findings" JSONB NOT NULL DEFAULT '[]',
    "score" INTEGER,
    "severity" INTEGER NOT NULL DEFAULT 0,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAiPassAt" TIMESTAMP(3),
    "hashAtAiPass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiQuotaDaily" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "exhausted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiQuotaDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageAudit_workspaceId_task_idx" ON "PageAudit"("workspaceId", "task");

-- CreateIndex
CREATE INDEX "PageAudit_workspaceId_lastCheckedAt_idx" ON "PageAudit"("workspaceId", "lastCheckedAt");

-- CreateIndex
CREATE INDEX "PageAudit_workspaceId_escalated_idx" ON "PageAudit"("workspaceId", "escalated");

-- CreateIndex
CREATE UNIQUE INDEX "PageAudit_workspaceId_entryId_url_task_key" ON "PageAudit"("workspaceId", "entryId", "url", "task");

-- CreateIndex
CREATE INDEX "AiQuotaDaily_workspaceId_date_idx" ON "AiQuotaDaily"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AiQuotaDaily_workspaceId_model_date_key" ON "AiQuotaDaily"("workspaceId", "model", "date");

-- AddForeignKey
ALTER TABLE "PageAudit" ADD CONSTRAINT "PageAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQuotaDaily" ADD CONSTRAINT "AiQuotaDaily_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
