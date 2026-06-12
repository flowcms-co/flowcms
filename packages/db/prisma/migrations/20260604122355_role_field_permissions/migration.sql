-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "allowedTypeIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "lockSeoMeta" BOOLEAN NOT NULL DEFAULT false;
