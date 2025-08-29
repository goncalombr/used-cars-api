// used-cars/api/src/jobs/runAlerts.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runAlertsOnce } from "./alertsRunner";

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await runAlertsOnce(prisma);

    console.log(`[alerts] Processed=${result.processed} CreatedEvents=${result.createdEvents} UpdatedOnly=${result.updatedOnly}`);
    for (const line of result.logs) console.log(line);

    process.exit(0);
  } catch (e: any) {
    console.error("[alerts] run failed:", e?.message ?? String(e));
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
