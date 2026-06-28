-- CreateTable
CREATE TABLE "ServerInstance" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "instanceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerInstance_instanceId_key" ON "ServerInstance"("instanceId");
