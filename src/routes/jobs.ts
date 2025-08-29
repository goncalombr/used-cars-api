// src/routes/jobs.ts
import { Router } from "express";
import { runAlertsOnce } from "../jobs/alertsRunner";

const jobsRouter = Router();

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

    const processed = await runAlertsOnce();
    res.json({ ok: true, processed });
  } catch (e: any) {
    console.error("[jobs] /jobs/alerts/run error:", e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

export { jobsRouter };
