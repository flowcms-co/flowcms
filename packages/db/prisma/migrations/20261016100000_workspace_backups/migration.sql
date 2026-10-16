-- Workspace snapshots for the Super Admin master rollback.
CREATE TABLE "WorkspaceBackup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "counts" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "hash" TEXT,
    "createdById" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceBackup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkspaceBackup_workspaceId_createdAt_idx" ON "WorkspaceBackup"("workspaceId", "createdAt");
ALTER TABLE "WorkspaceBackup" ADD CONSTRAINT "WorkspaceBackup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
