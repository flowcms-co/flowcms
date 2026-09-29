-- Content hash of each uploaded file, used to flag duplicate uploads.
ALTER TABLE "Media" ADD COLUMN "hash" TEXT;

CREATE INDEX "Media_workspaceId_hash_idx" ON "Media"("workspaceId", "hash");
