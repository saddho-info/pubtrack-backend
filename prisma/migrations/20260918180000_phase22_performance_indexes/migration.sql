-- Phase 22: compound indexes for common list/unread filters + receipt integrity.

CREATE INDEX "BookCopy_editionId_libraryId_status_idx" ON "BookCopy"("editionId", "libraryId", "status");

CREATE INDEX "BookCopy_publisherId_editionId_status_idx" ON "BookCopy"("publisherId", "editionId", "status");

CREATE UNIQUE INDEX "StockReceiptItem_stockReceiptId_copyId_key" ON "StockReceiptItem"("stockReceiptId", "copyId");

CREATE INDEX "Notification_publisherId_readAt_createdAt_idx" ON "Notification"("publisherId", "readAt", "createdAt");

CREATE INDEX "Notification_libraryId_readAt_createdAt_idx" ON "Notification"("libraryId", "readAt", "createdAt");
