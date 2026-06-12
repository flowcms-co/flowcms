-- CreateTable
CREATE TABLE "Plugin" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plugin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plugin_workspaceId_idx" ON "Plugin"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Plugin_workspaceId_key_key" ON "Plugin"("workspaceId", "key");

-- AddForeignKey
ALTER TABLE "Plugin" ADD CONSTRAINT "Plugin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
