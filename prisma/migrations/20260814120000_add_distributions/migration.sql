-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "BookCopy" ADD COLUMN "distributionItemId" TEXT;

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'DRAFT',
    "code" TEXT NOT NULL,
    "notes" TEXT,
    "actorUserId" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionItem" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Distribution_publisherId_code_key" ON "Distribution"("publisherId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Distribution_publisherId_idempotencyKey_key" ON "Distribution"("publisherId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Distribution_publisherId_status_createdAt_idx" ON "Distribution"("publisherId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Distribution_libraryId_status_idx" ON "Distribution"("libraryId", "status");

-- CreateIndex
CREATE INDEX "Distribution_createdAt_idx" ON "Distribution"("createdAt");

-- CreateIndex
CREATE INDEX "DistributionItem_distributionId_idx" ON "DistributionItem"("distributionId");

-- CreateIndex
CREATE INDEX "DistributionItem_editionId_idx" ON "DistributionItem"("editionId");

-- CreateIndex
CREATE INDEX "BookCopy_distributionItemId_idx" ON "BookCopy"("distributionItemId");

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookCopy" ADD CONSTRAINT "BookCopy_distributionItemId_fkey" FOREIGN KEY ("distributionItemId") REFERENCES "DistributionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DistributionItem" ADD CONSTRAINT "DistributionItem_quantity_positive" CHECK ("quantity" > 0);
