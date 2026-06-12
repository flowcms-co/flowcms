-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL');

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_workspaceId_userId_status_idx" ON "Job"("workspaceId", "userId", "status");

-- CreateIndex
CREATE INDEX "Job_workspaceId_createdAt_idx" ON "Job"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentEntry_workspaceId_status_updatedAt_idx" ON "ContentEntry"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ContentEntry_workspaceId_authorId_idx" ON "ContentEntry"("workspaceId", "authorId");

-- CreateIndex
CREATE INDEX "ContentEntry_workspaceId_locale_idx" ON "ContentEntry"("workspaceId", "locale");

-- CreateIndex
CREATE INDEX "Media_workspaceId_createdAt_idx" ON "Media"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
