-- Immutable consent audit trail: who accepted what, when, from which IP
-- (server-observed + browser-reported) and which browser/OS/device.
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "termsAccepted" BOOLEAN NOT NULL DEFAULT true,
    "marketingAccepted" BOOLEAN NOT NULL DEFAULT true,
    "ip" TEXT,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
