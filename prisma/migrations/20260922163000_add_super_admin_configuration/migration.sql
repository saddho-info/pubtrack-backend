-- CreateEnum
CREATE TYPE "FeatureFlagScope" AS ENUM ('PUBLISHER', 'LIBRARY');

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlagOverride" (
    "id" TEXT NOT NULL,
    "featureFlagId" TEXT NOT NULL,
    "scope" "FeatureFlagScope" NOT NULL,
    "publisherId" TEXT,
    "libraryId" TEXT,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeatureFlagOverride_target_check" CHECK (
        ("scope" = 'PUBLISHER' AND "publisherId" IS NOT NULL AND "libraryId" IS NULL)
        OR
        ("scope" = 'LIBRARY' AND "libraryId" IS NOT NULL AND "publisherId" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");
CREATE INDEX "FeatureFlag_isActive_idx" ON "FeatureFlag"("isActive");
CREATE INDEX "FeatureFlagOverride_featureFlagId_scope_idx" ON "FeatureFlagOverride"("featureFlagId", "scope");
CREATE INDEX "FeatureFlagOverride_publisherId_idx" ON "FeatureFlagOverride"("publisherId");
CREATE INDEX "FeatureFlagOverride_libraryId_idx" ON "FeatureFlagOverride"("libraryId");
CREATE UNIQUE INDEX "FeatureFlagOverride_flag_publisher_key"
    ON "FeatureFlagOverride"("featureFlagId", "publisherId")
    WHERE "publisherId" IS NOT NULL;
CREATE UNIQUE INDEX "FeatureFlagOverride_flag_library_key"
    ON "FeatureFlagOverride"("featureFlagId", "libraryId")
    WHERE "libraryId" IS NOT NULL;
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- AddForeignKey
ALTER TABLE "FeatureFlagOverride"
    ADD CONSTRAINT "FeatureFlagOverride_featureFlagId_fkey"
    FOREIGN KEY ("featureFlagId") REFERENCES "FeatureFlag"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeatureFlagOverride"
    ADD CONSTRAINT "FeatureFlagOverride_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeatureFlagOverride"
    ADD CONSTRAINT "FeatureFlagOverride_libraryId_fkey"
    FOREIGN KEY ("libraryId") REFERENCES "Library"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
