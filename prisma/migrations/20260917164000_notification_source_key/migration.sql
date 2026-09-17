ALTER TABLE "Notification" ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "Notification_sourceKey_key" ON "Notification"("sourceKey");
