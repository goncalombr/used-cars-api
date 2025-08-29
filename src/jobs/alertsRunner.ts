// used-cars/api/src/jobs/alertsRunner.ts
import { PrismaClient } from '@prisma/client';

type Prismaish = PrismaClient & { [k: string]: any };

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
 * Process saved searches that are due by cadence.
 * - If new listings since lastCheck > 0 => create AlertEvent and set lastNotified
 * - Always update lastCheck to now for processed searches
 */
export async function processDueSavedSearches(prisma: Prismaish): Promise<{ processed: number }> {
  const now = new Date();

  // Find searches due by cadence
  const due = await prisma.savedSearch.findMany({
    where: {
      notify: true,
      OR: [
        { lastCheck: null },
        {
          AND: [
            { lastCheck: { not: null } },
            // lastCheck older than cadenceMins
            // We'll check in JS because Prisma doesn't support "age > x minutes" natively.
          ],
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  // Filter here for cadence
  const actuallyDue = due.filter((s: any) => {
    if (!s.lastCheck) return true;
    const mins = Number(s.cadenceMins ?? 1440);
    const nextAt = new Date(s.lastCheck.getTime() + mins * 60 * 1000);
    return now >= nextAt;
  });

  if (!actuallyDue.length) return { processed: 0 };

  let processed = 0;

  for (const s of actuallyDue) {
    const where = buildWhereFromFilters(s.filters);
    if (s.lastCheck) {
      (where as any).scraped_at = { gt: s.lastCheck };
    }

    const newCount = await prisma.listings.count({ where });

    await prisma.$transaction(async (tx: Prismaish) => {
      // Always update lastCheck
      await tx.savedSearch.update({
        where: { id: s.id },
        data: { lastCheck: now },
      });

      if (newCount > 0) {
        await tx.alertEvent.create({
          data: {
            savedSearchId: s.id,
            sentAt: now,
            listingsCount: newCount,
            details: {}, // keep simple
          },
        });
        await tx.savedSearch.update({
          where: { id: s.id },
          data: { lastNotified: now },
        });
      }
    });

    processed += 1;
  }

  return { processed };
}
