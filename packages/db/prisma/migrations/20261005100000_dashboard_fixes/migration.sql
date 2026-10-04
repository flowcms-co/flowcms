-- Dashboard fixes: a workspace timezone for "today"/week maths, and the first
-- time an entry went live (re-publishing edits resets publishedAt, which made one
-- page count as a new piece every time).
ALTER TABLE "Workspace" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "ContentEntry" ADD COLUMN "firstPublishedAt" TIMESTAMP(3);
UPDATE "ContentEntry" SET "firstPublishedAt" = "publishedAt" WHERE "publishedAt" IS NOT NULL;
