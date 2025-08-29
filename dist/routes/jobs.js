"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRouter = void 0;
// src/routes/jobs.ts
const express_1 = require("express");
const alertsRunner_1 = require("../jobs/alertsRunner");
const jobsRouter = (0, express_1.Router)();
exports.jobsRouter = jobsRouter;
/**
 * POST /jobs/alerts/run
 * Header: x-cron-secret: <CRON_SECRET>
 * Kicks the alerts job once and returns how many searches were processed.
 */
jobsRouter.post("/jobs/alerts/run", async (req, res) => {
    try {
        const provided = String(req.headers["x-cron-secret"] || "").trim();
        const expected = String(process.env.CRON_SECRET || "").trim();
        if (!expected || provided !== expected) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const processed = await (0, alertsRunner_1.runAlertsOnce)();
        res.json({ ok: true, processed });
    }
    catch (e) {
        console.error("[jobs] /jobs/alerts/run error:", e);
        res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
