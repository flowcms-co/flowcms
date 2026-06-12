-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorBackupCodes" JSONB NOT NULL DEFAULT '[]';
