-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notificationPrefs" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "jsonLdOrg" JSONB;
