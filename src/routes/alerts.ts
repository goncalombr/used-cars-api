import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const db = prisma as any;
const router = Router();

/**
 * GET /alerts?email=you@example.com
 * Returns the 20 most-recent AlertEvents for that user's saved searches.
 */
router.get("/", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim();
    if (!email) return res.status(400).json({ error: "email_required" });

    const items = await db.alertEvent.findMany({
      where: { savedSearch: { userEmail: email } },
      orderBy: { sentAt: "desc" },
      take: 20,
      select: {
        id: true,
        sentAt: true,
        listingsCount: true,
        details: true,
        savedSearch: { select: { id: true, name: true, query: true } },
      },
    });

    res.json({ items });
  } catch (e: any) {
    console.error("[alerts] GET error:", e);
    res.status(500).json({ error: "failed_to_list_alerts", detail: e?.message ?? String(e) });
  }
});

export const alertsRouter = router;
