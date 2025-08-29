import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    select count(*)::int as count from public.listings
  `;
  console.log('Connected! listings count =', rows[0]?.count ?? 0);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
