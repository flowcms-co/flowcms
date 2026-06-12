-- Soft-delete columns (no hard deletes): revoked tokens and removed webhooks are
-- marked with a timestamp, rejected at auth / hidden from lists, never purged.

-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN "deletedAt" TIMESTAMP(3);
