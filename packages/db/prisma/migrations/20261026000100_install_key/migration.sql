-- Install key issued by the vendor console on heartbeat, stored encrypted.
ALTER TABLE "ServerInstance" ADD COLUMN IF NOT EXISTS "installKeyEnc" TEXT;
