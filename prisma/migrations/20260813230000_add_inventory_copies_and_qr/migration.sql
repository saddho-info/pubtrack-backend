-- CreateEnum
CREATE TYPE "CopyStatus" AS ENUM ('IN_STOCK_PUBLISHER', 'DISTRIBUTED', 'IN_STOCK_LIBRARY', 'SOLD', 'RETURNED', 'LOST');

-- CreateEnum
CREATE TYPE "InventoryHolderType" AS ENUM ('PUBLISHER', 'LIBRARY');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PRINT_RECEIPT', 'DISTRIBUTION', 'RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT', 'LOSS');

-- CreateEnum
CREATE TYPE "CopyBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Edition" ADD COLUMN "nextCopyNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "BookCopy" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "libraryId" TEXT,
    "status" "CopyStatus" NOT NULL DEFAULT 'IN_STOCK_PUBLISHER',
    "copyNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrCode" (
    "id" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "holderType" "InventoryHolderType" NOT NULL,
    "holderId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "inTransit" INTEGER NOT NULL DEFAULT 0,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "editionId" TEXT NOT NULL,
    "copyId" TEXT,
    "quantity" INTEGER NOT NULL,
    "fromHolderType" "InventoryHolderType",
    "fromHolderId" TEXT,
    "toHolderType" "InventoryHolderType",
    "toHolderId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyGenerationBatch" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "createdQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "CopyBatchStatus" NOT NULL DEFAULT 'PENDING',
    "actorUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyGenerationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookCopy_editionId_copyNumber_key" ON "BookCopy"("editionId", "copyNumber");

-- CreateIndex
CREATE INDEX "BookCopy_editionId_status_idx" ON "BookCopy"("editionId", "status");

-- CreateIndex
CREATE INDEX "BookCopy_publisherId_status_idx" ON "BookCopy"("publisherId", "status");

-- CreateIndex
CREATE INDEX "BookCopy_libraryId_status_idx" ON "BookCopy"("libraryId", "status");

-- CreateIndex
CREATE INDEX "BookCopy_status_idx" ON "BookCopy"("status");

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_copyId_key" ON "QrCode"("copyId");

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_token_key" ON "QrCode"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_editionId_holderType_holderId_key" ON "Inventory"("editionId", "holderType", "holderId");

-- CreateIndex
CREATE INDEX "Inventory_holderType_holderId_idx" ON "Inventory"("holderType", "holderId");

-- CreateIndex
CREATE INDEX "Inventory_editionId_idx" ON "Inventory"("editionId");

-- CreateIndex
CREATE INDEX "InventoryMovement_editionId_createdAt_idx" ON "InventoryMovement"("editionId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_copyId_idx" ON "InventoryMovement"("copyId");

-- CreateIndex
CREATE INDEX "InventoryMovement_actorUserId_idx" ON "InventoryMovement"("actorUserId");

-- CreateIndex
CREATE INDEX "InventoryMovement_refType_refId_idx" ON "InventoryMovement"("refType", "refId");

-- CreateIndex
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CopyGenerationBatch_publisherId_idempotencyKey_key" ON "CopyGenerationBatch"("publisherId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CopyGenerationBatch_publisherId_createdAt_idx" ON "CopyGenerationBatch"("publisherId", "createdAt");

-- CreateIndex
CREATE INDEX "CopyGenerationBatch_editionId_idx" ON "CopyGenerationBatch"("editionId");

-- AddForeignKey
ALTER TABLE "BookCopy" ADD CONSTRAINT "BookCopy_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookCopy" ADD CONSTRAINT "BookCopy_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookCopy" ADD CONSTRAINT "BookCopy_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "BookCopy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "BookCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyGenerationBatch" ADD CONSTRAINT "CopyGenerationBatch_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyGenerationBatch" ADD CONSTRAINT "CopyGenerationBatch_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyGenerationBatch" ADD CONSTRAINT "CopyGenerationBatch_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Non-negative aggregate counts (ledger writes must not drive stock below zero).
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_onHand_nonnegative" CHECK ("onHand" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_inTransit_nonnegative" CHECK ("inTransit" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_sold_nonnegative" CHECK ("sold" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_returned_nonnegative" CHECK ("returned" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_lost_nonnegative" CHECK ("lost" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_lowStockThreshold_nonnegative" CHECK ("lowStockThreshold" >= 0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_quantity_positive" CHECK ("quantity" > 0);
