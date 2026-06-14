-- AlterTable
ALTER TABLE "ContentEntry" ADD COLUMN     "draftApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "draftData" JSONB;
