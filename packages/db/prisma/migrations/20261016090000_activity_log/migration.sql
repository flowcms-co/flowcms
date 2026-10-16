-- Activity log: who did what, from where, to which entry, with the field diff.
ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorName" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "actorRole" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "tokenId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "entryType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "title" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "slug" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "versionBefore" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN "versionAfter" INTEGER;
CREATE INDEX "AuditLog_workspaceId_resourceId_createdAt_idx" ON "AuditLog"("workspaceId", "resourceId", "createdAt");
CREATE INDEX "AuditLog_workspaceId_action_createdAt_idx" ON "AuditLog"("workspaceId", "action", "createdAt");
CREATE INDEX "AuditLog_workspaceId_userId_createdAt_idx" ON "AuditLog"("workspaceId", "userId", "createdAt");

-- Append only: a logged event can never be edited. Rows still leave by retention
-- pruning and with their workspace.
CREATE OR REPLACE FUNCTION audit_log_no_update() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AuditLog_no_update" BEFORE UPDATE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION audit_log_no_update();

-- Who made each version, whether it was a draft or what went live, and why.
ALTER TABLE "ContentVersion" ADD COLUMN "actorName" TEXT;
ALTER TABLE "ContentVersion" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'published';
ALTER TABLE "ContentVersion" ADD COLUMN "note" TEXT;
ALTER TABLE "ContentVersion" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- Older versions: name the user who made them, and label anything that was not
-- live as a draft. (Older edits to a live page's draft were stored as PUBLISHED and
-- can't be told apart now; new ones are labelled.)
UPDATE "ContentVersion" v SET "actorName" = COALESCE(u."name", u."email") FROM "User" u WHERE u."id" = v."createdById";
UPDATE "ContentVersion" SET "label" = 'draft' WHERE "status" <> 'PUBLISHED';

-- Retention, alerts and upload limits.
ALTER TABLE "Workspace" ADD COLUMN "auditRetentionDays" INTEGER NOT NULL DEFAULT 365;
ALTER TABLE "Workspace" ADD COLUMN "alertEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Workspace" ADD COLUMN "alertsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN "mediaMaxMb" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "Workspace" ADD COLUMN "mediaAllowedTypes" TEXT[] DEFAULT ARRAY['jpg', 'png', 'webp', 'avif', 'gif', 'mp4', 'webm', 'mov', 'pdf', 'zip', 'txt', 'csv', 'md', 'doc', 'docx']::TEXT[];

-- Media: caption, tags, an updated time, and folders that can exist empty.
ALTER TABLE "Media" ADD COLUMN "caption" TEXT;
ALTER TABLE "Media" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Media" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Media" ADD COLUMN "uploadedBy" TEXT;
UPDATE "Media" m SET "uploadedBy" = COALESCE(u."name", u."email") FROM "User" u WHERE u."id" = m."createdById";

CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaFolder_workspaceId_name_key" ON "MediaFolder"("workspaceId", "name");
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleted items, kept 30 days for restore.
CREATE TABLE "DeletedItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "payload" JSONB NOT NULL,
    "deletedById" TEXT,
    "deletedBy" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeletedItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeletedItem_workspaceId_deletedAt_idx" ON "DeletedItem"("workspaceId", "deletedAt");
CREATE INDEX "DeletedItem_purgeAt_idx" ON "DeletedItem"("purgeAt");
ALTER TABLE "DeletedItem" ADD CONSTRAINT "DeletedItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
