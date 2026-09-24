-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");
CREATE UNIQUE INDEX "RefreshSession_replacedById_key" ON "RefreshSession"("replacedById");
CREATE INDEX "RefreshSession_userId_idx" ON "RefreshSession"("userId");
CREATE INDEX "RefreshSession_userId_revokedAt_idx" ON "RefreshSession"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "RefreshSession"
    ADD CONSTRAINT "RefreshSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RefreshSession"
    ADD CONSTRAINT "RefreshSession_replacedById_fkey"
    FOREIGN KEY ("replacedById") REFERENCES "RefreshSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing single-hash logins as one session (7-day remaining life).
INSERT INTO "RefreshSession" ("id", "userId", "tokenHash", "expiresAt", "createdAt", "updatedAt")
SELECT
    'rs_' || replace(gen_random_uuid()::text, '-', ''),
    u."id",
    u."refreshTokenHash",
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
FROM "User" u
WHERE u."refreshTokenHash" IS NOT NULL;

UPDATE "User" SET "refreshTokenHash" = NULL WHERE "refreshTokenHash" IS NOT NULL;
