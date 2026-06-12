-- AlterTable
ALTER TABLE "User" ADD COLUMN     "digestFrequency" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "lastDigestAt" TIMESTAMP(3);
