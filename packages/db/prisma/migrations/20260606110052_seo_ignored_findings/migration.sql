-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "ignoredFindings" TEXT[] DEFAULT ARRAY[]::TEXT[];
