-- Choose who counts as an entry's author: its creator or its last editor
-- (Workspace.authorMode), with an optional hand-picked author per entry.
ALTER TABLE "Workspace" ADD COLUMN "authorMode" TEXT NOT NULL DEFAULT 'creator';
ALTER TABLE "ContentEntry" ADD COLUMN "lastEditorId" TEXT;
ALTER TABLE "ContentEntry" ADD COLUMN "authorOverrideId" TEXT;

-- Backfill the last editor from version history: the newest snapshot whose data
-- differs from the one before it. Status-only snapshots (approve, publish) repeat
-- the previous data, so they are skipped.
UPDATE "ContentEntry" e
SET "lastEditorId" = v."createdById"
FROM (
    SELECT DISTINCT ON ("entryId") "entryId", "createdById"
    FROM (
        SELECT "entryId", "createdById", "versionNumber",
               "data" IS DISTINCT FROM lag("data") OVER (PARTITION BY "entryId" ORDER BY "versionNumber") AS changed
        FROM "ContentVersion"
    ) s
    WHERE s.changed AND s."createdById" IS NOT NULL
    ORDER BY "entryId", "versionNumber" DESC
) v
WHERE v."entryId" = e."id";
