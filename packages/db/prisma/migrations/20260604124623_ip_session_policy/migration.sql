-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "ipAllowlist" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "sessionIdleMinutes" INTEGER,
ADD COLUMN     "sessionMaxHours" INTEGER;
