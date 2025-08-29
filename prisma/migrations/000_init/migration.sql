-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."listings" (
    "id" BIGSERIAL NOT NULL,
    "listing_id" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "ano" INTEGER,
    "km" INTEGER,
    "preco" INTEGER,
    "local" TEXT,
    "transmissao" TEXT,
    "combustivel" TEXT,
    "scraped_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_listings_ano" ON "public"."listings"("ano" ASC);

-- CreateIndex
CREATE INDEX "idx_listings_km" ON "public"."listings"("km" ASC);

-- CreateIndex
CREATE INDEX "idx_listings_local" ON "public"."listings"("local" ASC);

-- CreateIndex
CREATE INDEX "idx_listings_marca" ON "public"."listings"("marca" ASC);

-- CreateIndex
CREATE INDEX "idx_listings_modelo" ON "public"."listings"("modelo" ASC);

-- CreateIndex
CREATE INDEX "idx_listings_preco" ON "public"."listings"("preco" ASC);

-- CreateIndex
CREATE INDEX "idx_listings_scraped_at" ON "public"."listings"("scraped_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "listings_listing_id_key" ON "public"."listings"("listing_id" ASC);

