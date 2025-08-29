// src/jobs/alertsRunner.ts
import { PrismaClient, Prisma } from "@prisma/client";

const prismaSingleton = new PrismaClient();

// Build a Prisma where clause from saved search filters
function buildWhereFromFilters(filters: any) {
  const f = (filters ?? {}) as any;
  const where: any = {};

  // price
  if (f.price_min != null) where.preco = { ...(where.preco ?? {}), gte: Number(f.price_min) };
  if (f.price_max != null) where.preco = { ...(where.preco ?? {}), lte: Number(f.price_max) };

  // km
  if (f.km_min    != null) where.km   = { ...(where.km ?? {}), gte: Number(f.km_min) };
  if (f.km_max    != null) where.km   = { ...(where.km ?? {}), lte: Number(f.km_max) };

  // year
  if (f.year_min  != null) where.ano  = { ...(where.ano ?? {}), gte: Number(f.year_min) };
  if (f.year_max  != null) where.ano  = { ...(where.ano ?? {}), lte: Number(f.year_max) };

  // enums / arrays
  if (Array.isArray(f.fuels)  && f.fuels.length)  where.combustivel = { in: f.fuels };
  if (Array.isArray(f.trans)  && f.trans.length)  where.transmissao = { in: f.trans };
  if (Array.isArray(f.locals) && f.locals.length) where.local       = { in: f.locals };

  // brand / model
  if (f.marca?.trim())  where.marca  = { equals: String(f.marca).trim() };
  if (f.modelo?.trim()) where.modelo = { equals: String(f.modelo).trim() };

  return where;
}

/**
 * Run alerts once.
 * Returns the number of saved searches that were processed.
 */
export async function runAlertsOnce(prismaArg?: PrismaClient): Promise<number> {
  const prisma = prismaArg ?? prismaSingleton;

  // Get all searches that have notifications enabled
  const all = await prisma.savedSearch.findMany({
    where: { notify: true },
    orderBy: { createdAt: "asc" },
  });

  // Filter in JS by cadence (safe and simple)
  const now = Date.now();
  const due = all.filter((s) => {
    const cad = s.cadenceMins ?? 1440;
    if (!s.lastCheck) return true;
    const minsSince = (now - new Date(s.lastCheck).getTime()) / 60000;
    return minsSince >= cad;
  });

  let processed = 0;

  for (const s of due) {
    const lastCheck = s.lastCheck ?? new Date(0);
    const where = buildWhereFromFilters(s.filters);
    (where as any).scraped_at = { gt: lastCheck };

    const count = await prisma.listings.count({ where });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Always move the checkpoint forward
      await tx.savedSearch.update({
        where: { id: s.id },
        data: { lastCheck: new Date() },
      });

      if (count > 0) {
        await tx.alertEvent.create({
          data: {
            savedSearchId: s.id,
            sentAt: new Date(),
            listingsCount: count,
            details: "", // optional text field; keep empty
          },
        });

        await tx.savedSearch.update({
          where: { id: s.id },
          data: { lastNotified: new Date() },
        });
      }
    });

    processed += 1;
  }

  return processed;
}
