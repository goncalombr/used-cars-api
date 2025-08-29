"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const rows = await prisma.$queryRaw `
    select count(*)::int as count from public.listings
  `;
    console.log('Connected! listings count =', rows[0]?.count ?? 0);
}
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
