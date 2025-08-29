"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertsRouter = void 0;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const db = prisma;
const router = (0, express_1.Router)();
/**
 * GET /alerts?email=you@example.com
 * Returns the 20 most-recent AlertEvents for that user's saved searches.
 */
router.get("/", async (req, res) => {
    try {
        const email = String(req.query.email || "").trim();
        if (!email)
            return res.status(400).json({ error: "email_required" });
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
    }
    catch (e) {
        console.error("[alerts] GET error:", e);
        res.status(500).json({ error: "failed_to_list_alerts", detail: e?.message ?? String(e) });
    }
});
exports.alertsRouter = router;
