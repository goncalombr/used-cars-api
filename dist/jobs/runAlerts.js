"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/jobs/runAlerts.ts
const client_1 = require("@prisma/client");
const alertsRunner_1 = require("./alertsRunner");
(async () => {
    const prisma = new client_1.PrismaClient();
    try {
        const n = await (0, alertsRunner_1.runAlertsOnce)(prisma);
        console.log(`[alerts] Processed ${n} search(es) due by cadence…`);
    }
    catch (e) {
        console.error("[alerts] Failed:", e);
        process.exitCode = 1;
    }
    finally {
        await prisma.$disconnect();
    }
})();
