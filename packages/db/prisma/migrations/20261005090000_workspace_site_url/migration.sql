-- Workspace-level public site URL, so the SEO crawl, PageSpeed and "View live"
-- links work without a Search Console connection. Backfilled from the Search
-- Console property where one is connected.
ALTER TABLE "Workspace" ADD COLUMN "siteUrl" TEXT;

UPDATE "Workspace" w
SET "siteUrl" = CASE
    WHEN i.config->>'siteUrl' LIKE 'sc-domain:%' THEN 'https://' || substring(i.config->>'siteUrl' from 11)
    ELSE rtrim(i.config->>'siteUrl', '/')
END
FROM "Integration" i
WHERE i."workspaceId" = w.id AND i.provider = 'gsc' AND coalesce(i.config->>'siteUrl', '') <> '';

-- How fast the SEO audit and crawler may request pages from the site.
ALTER TABLE "Workspace" ADD COLUMN "seoCrawlRps" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- What the audit read from the live page (or a stored PageSpeed run).
ALTER TABLE "PageAudit" ADD COLUMN "live" JSONB;
