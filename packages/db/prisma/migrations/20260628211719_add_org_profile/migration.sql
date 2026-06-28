-- CreateTable
CREATE TABLE "OrgProfile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "legalName" TEXT,
    "addressLines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "taxId" TEXT,
    "billingEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgProfile_pkey" PRIMARY KEY ("id")
);
