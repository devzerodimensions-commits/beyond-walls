-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SectionType" ADD VALUE 'SHOP_BY_ATTRIBUTE';
ALTER TYPE "SectionType" ADD VALUE 'PERSONALISATION_DEMO';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "includedItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "installationNote" TEXT,
ADD COLUMN     "shippingNote" TEXT;
