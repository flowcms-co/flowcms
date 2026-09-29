-- Entry title as a real column, kept in step with the body by the database itself,
-- so lists can search and sort by title across every entry without reading each
-- entry's full body. Generated columns cannot be written to.
ALTER TABLE "ContentEntry" ADD COLUMN "title" TEXT GENERATED ALWAYS AS ("data" ->> 'title') STORED;

-- The default list order (newest first, id as tie-break) within one workspace.
CREATE INDEX "ContentEntry_workspaceId_updatedAt_id_idx" ON "ContentEntry"("workspaceId", "updatedAt" DESC, "id" DESC);
