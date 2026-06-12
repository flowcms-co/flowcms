-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "approvalsRequired" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ContentReview" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentReview_entryId_idx" ON "ContentReview"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentReview_entryId_reviewerId_key" ON "ContentReview"("entryId", "reviewerId");

-- AddForeignKey
ALTER TABLE "ContentReview" ADD CONSTRAINT "ContentReview_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ContentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReview" ADD CONSTRAINT "ContentReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
