-- Consent capture on users: Terms of Service acceptance (incl. essential
-- service emails) and product/marketing email opt-in. Additive and nullable;
-- existing accounts are asked in-app on their next visit.
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "marketingOptInAt" TIMESTAMP(3);
