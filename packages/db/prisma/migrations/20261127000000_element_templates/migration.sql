-- CreateTable
CREATE TABLE "ElementTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "element" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ElementTemplate_workspaceId_idx" ON "ElementTemplate"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ElementTemplate_workspaceId_name_key" ON "ElementTemplate"("workspaceId", "name");

-- AddForeignKey
ALTER TABLE "ElementTemplate" ADD CONSTRAINT "ElementTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
