-- CreateTable
CREATE TABLE "public"."SavedSearch" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "cadenceMins" INTEGER NOT NULL DEFAULT 1440,
    "lastCheck" TIMESTAMPTZ(6),
    "lastNotified" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AlertEvent" (
    "id" BIGSERIAL NOT NULL,
    "savedSearchId" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listingsCount" INTEGER NOT NULL,
    "details" JSONB,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedSearch_userEmail_idx" ON "public"."SavedSearch"("userEmail");

-- CreateIndex
CREATE INDEX "AlertEvent_savedSearchId_sentAt_idx" ON "public"."AlertEvent"("savedSearchId", "sentAt");

-- AddForeignKey
ALTER TABLE "public"."AlertEvent" ADD CONSTRAINT "AlertEvent_savedSearchId_fkey" FOREIGN KEY ("savedSearchId") REFERENCES "public"."SavedSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
