-- Optional keyed path the SEO audit fetches live pages through (encrypted: it
-- holds a secret), for sites whose host can only exempt a path from its rate limit.
ALTER TABLE "Workspace" ADD COLUMN "seoFetchPrefixEnc" TEXT;
-- The crawl-rate ceiling learned per host, so later runs start below the site's limit.
ALTER TABLE "Workspace" ADD COLUMN "seoLearnedRate" JSONB;
