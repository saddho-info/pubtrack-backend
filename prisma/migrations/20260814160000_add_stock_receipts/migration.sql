-- AlterEnum
ALTER TYPE "DistributionStatus" ADD VALUE 'PARTIALLY_RECEIVED';
ALTER TYPE "DistributionStatus" ADD VALUE 'RECEIVED';

-- CreateEnum
CREATE TYPE "StockReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceiptDiscrepancy" AS ENUM ('NONE', 'MISSING', 'DAMAGED');

-- CreateTable
CREATE TABLE "StockReceipt" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "status" "StockReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "code" TEXT NOT NULL,
    "notes" TEXT,
    "actorUserId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceiptItem" (
    "id" TEXT NOT NULL,
    "stockReceiptId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "received" BOOLEAN NOT NULL DEFAULT true,
    "discrepancy" "ReceiptDiscrepancy" NOT NULL DEFAULT 'NONE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_libraryId_code_key" ON "StockReceipt"("libraryId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_libraryId_idempotencyKey_key" ON "StockReceipt"("libraryId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockReceipt_libraryId_status_createdAt_idx" ON "StockReceipt"("libraryId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StockReceipt_distributionId_idx" ON "StockReceipt"("distributionId");

-- CreateIndex
CREATE INDEX "StockReceipt_createdAt_idx" ON "StockReceipt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_distributionId_draft_key" ON "StockReceipt"("distributionId") WHERE "status" = 'DRAFT';

-- CreateIndex
CREATE UNIQUE INDEX "StockReceiptItem_copyId_received_key" ON "StockReceiptItem"("copyId") WHERE "received" = true;

-- CreateIndex
CREATE INDEX "StockReceiptItem_stockReceiptId_idx" ON "StockReceiptItem"("stockReceiptId");

-- CreateIndex
CREATE INDEX "StockReceiptItem_editionId_idx" ON "StockReceiptItem"("editionId");

-- CreateIndex
CREATE INDEX "StockReceiptItem_copyId_idx" ON "StockReceiptItem"("copyId");

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "BookCopy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
