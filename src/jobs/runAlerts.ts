// src/jobs/runAlerts.ts
import { PrismaClient } from "@prisma/client";
import { runAlertsOnce } from "./alertsRunner";

(async () => {
  const prisma = new PrismaClient();
  try {
    const n = await runAlertsOnce(prisma);
    console.log(`[alerts] Processed ${n} search(es) due by cadence…`);
  } catch (e) {
    console.error("[alerts] Failed:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
