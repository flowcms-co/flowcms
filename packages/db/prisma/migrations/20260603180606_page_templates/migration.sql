-- CreateTable
CREATE TABLE "PageTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'document',
    "color" TEXT NOT NULL DEFAULT '#6C5CE7',
    "typeApiId" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "jsonLd" TEXT NOT NULL DEFAULT 'WebPage',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "body" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageTemplate_workspaceId_idx" ON "PageTemplate"("workspaceId");

-- AddForeignKey
ALTER TABLE "PageTemplate" ADD CONSTRAINT "PageTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
