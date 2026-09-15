-- CreateTable
CREATE TABLE "PublisherLibrary" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublisherLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublisherLibrary_libraryId_idx" ON "PublisherLibrary"("libraryId");

-- CreateIndex
CREATE INDEX "PublisherLibrary_publisherId_isActive_idx" ON "PublisherLibrary"("publisherId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherLibrary_publisherId_libraryId_key" ON "PublisherLibrary"("publisherId", "libraryId");

-- AddForeignKey
ALTER TABLE "PublisherLibrary" ADD CONSTRAINT "PublisherLibrary_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherLibrary" ADD CONSTRAINT "PublisherLibrary_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE CASCADE ON UPDATE CASCADE;
