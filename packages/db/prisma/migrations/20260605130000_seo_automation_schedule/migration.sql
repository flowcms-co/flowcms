-- Pro+ (seo_automation): scheduled AI auditing config + last-run stamps.
ALTER TABLE "Workspace" ADD COLUMN "aiScanEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN "aiScanConfig" JSONB;
ALTER TABLE "Workspace" ADD COLUMN "lastIncrementalScanAt" TIMESTAMP(3);
ALTER TABLE "Workspace" ADD COLUMN "lastFullScanAt" TIMESTAMP(3);
