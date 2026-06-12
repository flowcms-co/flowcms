-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "defaultLocale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "locales" JSONB NOT NULL DEFAULT '["en"]';
