import { Router } from "express";
import { runAlertsOnce } from "../jobs/runAlerts";

const jobsRouter = Router();

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

    const processed = await runAlertsOnce();
    res.json({ ok: true, processed });
  } catch (e: any) {
    console.error("[jobs] alerts/run error:", e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

jobsRouter.get("/alerts/run", async (req, res) => {
  try {
    const s = String((req.query.s as string) || "").trim();
    const needed = String(process.env.CRON_SECRET || "").trim();

    if (!needed) {
      return res.status(500).json({ ok: false, error: "cron_secret_not_configured" });
    }
    if (!s || s !== needed) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const processed = await runAlertsOnce();
    res.json({ ok: true, processed });
  } catch (e: any) {
    console.error("[jobs] alerts/run(GET) error:", e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

export { jobsRouter };
export default jobsRouter;
