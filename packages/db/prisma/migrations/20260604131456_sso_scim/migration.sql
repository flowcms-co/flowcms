-- AlterEnum
ALTER TYPE "ApiTokenType" ADD VALUE 'SCIM';

-- CreateTable
CREATE TABLE "SsoConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "issuer" TEXT,
    "authorizationUrl" TEXT,
    "tokenUrl" TEXT,
    "jwksUri" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "autoProvision" BOOLEAN NOT NULL DEFAULT false,
    "allowedDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SsoConfig_workspaceId_key" ON "SsoConfig"("workspaceId");

-- AddForeignKey
ALTER TABLE "SsoConfig" ADD CONSTRAINT "SsoConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
