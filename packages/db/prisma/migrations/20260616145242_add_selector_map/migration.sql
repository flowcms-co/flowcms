-- CreateTable
CREATE TABLE "SelectorMap" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentTypeId" TEXT NOT NULL,
    "urlPattern" TEXT NOT NULL DEFAULT '',
    "bindings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelectorMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SelectorMap_workspaceId_idx" ON "SelectorMap"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SelectorMap_contentTypeId_urlPattern_key" ON "SelectorMap"("contentTypeId", "urlPattern");

-- AddForeignKey
ALTER TABLE "SelectorMap" ADD CONSTRAINT "SelectorMap_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectorMap" ADD CONSTRAINT "SelectorMap_contentTypeId_fkey" FOREIGN KEY ("contentTypeId") REFERENCES "ContentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
