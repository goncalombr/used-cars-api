"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRouter = void 0;
const express_1 = require("express");
const runAlerts_1 = require("../jobs/runAlerts");
const jobsRouter = (0, express_1.Router)();
exports.jobsRouter = jobsRouter;
/**
 * Health ping for the jobs router
 * GET /jobs/ping -> { ok: true }
 */
jobsRouter.get("/ping", (_req, res) => {
    res.json({ ok: true });
});
/**
 * Trigger alerts once.
 *
 * You can call this in two ways:
 * 1) POST /jobs/alerts/run  with header:  x-cron-secret: <SECRET>
 * 2) GET  /jobs/alerts/run?s=<SECRET>
 */
jobsRouter.post("/alerts/run", async (req, res) => {
    try {
        const hdr = String(req.headers["x-cron-secret"] || "").trim();
        const s = hdr || "";
        const needed = String(process.env.CRON_SECRET || "").trim();
        if (!needed) {
            return res.status(500).json({ ok: false, error: "cron_secret_not_configured" });
        }
        if (!s || s !== needed) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const processed = await (0, runAlerts_1.runAlertsOnce)();
        res.json({ ok: true, processed });
    }
    catch (e) {
        console.error("[jobs] alerts/run error:", e);
        res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
jobsRouter.get("/alerts/run", async (req, res) => {
    try {
        const s = String(req.query.s || "").trim();
        const needed = String(process.env.CRON_SECRET || "").trim();
        if (!needed) {
            return res.status(500).json({ ok: false, error: "cron_secret_not_configured" });
        }
        if (!s || s !== needed) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const processed = await (0, runAlerts_1.runAlertsOnce)();
        res.json({ ok: true, processed });
    }
    catch (e) {
        console.error("[jobs] alerts/run(GET) error:", e);
        res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
});
exports.default = jobsRouter;
