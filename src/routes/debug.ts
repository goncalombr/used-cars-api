import { Router } from "express";

const router = Router();

function redactUrl(u?: string | null) {
  if (!u) return { has: false };
  try {
    const url = new URL(u);
    // Hide credentials, keep host/db only
    return {
      has: true,
      protocol: url.protocol.replace(":", ""),
      host: url.host,
      pathname: url.pathname,
      params: Array.from(url.searchParams.keys()),
    };
  } catch {
    return { has: true, raw: true };
  }
}

/**
 * GET /debug/env
 * Shows whether critical env vars are present (no secrets).
 */
router.get("/env", (_req, res) => {
  const db = redactUrl(process.env.DATABASE_URL);
  const cron = !!process.env.CRON_SECRET;
  res.json({
    node_env: process.env.NODE_ENV || "unknown",
    has_database_url: db.has,
    database_url_info: db,
    has_cron_secret: cron,
    enforce_email: (process.env.ENFORCE_EMAIL_OWNERSHIP ?? "") === "1",
    env_loaded_from: "dotenv + /etc/secrets/.env + single secret files",
  });
});

/**
 * GET /debug/db
 * Simple probe against the database.
 */
router.get("/db", async (_req, res) => {
  try {
    // Lazy import so this file stays tiny
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const rows = (await prisma.$queryRawUnsafe(`select 1 as one`)) as any[];
    await prisma.$disconnect();
    res.json({ ok: true, rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, message: e?.message ?? String(e) });
  }
});

export default router;
