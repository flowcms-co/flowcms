-- CreateTable
CREATE TABLE "EntryRelation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "fromField" TEXT NOT NULL,
    "fromTypeId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntryRelation_workspaceId_toId_fromTypeId_fromField_idx" ON "EntryRelation"("workspaceId", "toId", "fromTypeId", "fromField");

-- CreateIndex
CREATE INDEX "EntryRelation_workspaceId_fromId_fromField_idx" ON "EntryRelation"("workspaceId", "fromId", "fromField");

-- CreateIndex
CREATE UNIQUE INDEX "EntryRelation_fromId_fromField_toId_key" ON "EntryRelation"("fromId", "fromField", "toId");

-- AddForeignKey
ALTER TABLE "EntryRelation" ADD CONSTRAINT "EntryRelation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "ContentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRelation" ADD CONSTRAINT "EntryRelation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "ContentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
