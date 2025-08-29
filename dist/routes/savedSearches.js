"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
// Cast to any so we can use $queryRawUnsafe/$executeRawUnsafe without ts gripes
const db = prisma;
const router = (0, express_1.Router)();
/* --------------------------- helpers --------------------------- */
const toInt = (v, def) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : def;
};
// Header email + per-item ownership guard
function headerEmail(req) {
    return String(req.headers["x-user-email"] || "").trim().toLowerCase();
}
async function assertOwnerOr401(req, res, id) {
    const hdr = headerEmail(req);
    if (!hdr) {
        res.status(401).json({ error: "unauthorized_email_header_missing" });
        return null;
    }
    const s = await db.savedSearch.findUnique({ where: { id } });
    if (!s) {
        res.status(404).json({ error: "not_found" });
        return null;
    }
    if (String(s.userEmail).trim().toLowerCase() !== hdr) {
        res.status(401).json({ error: "unauthorized_owner" });
        return null;
    }
    return s; // caller may reuse the record
}
// ===== Zod schemas for body validation =====
const PostBody = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1).max(200),
    filters: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).default({}),
    query: zod_1.z.string().default(""),
    notify: zod_1.z.boolean().default(false),
    cadenceMins: zod_1.z.number().int().positive().max(7 * 24 * 60).default(1440),
});
const PatchBody = zod_1.z.object({
    name: zod_1.z.string().min(1).max(200).optional(),
    filters: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    query: zod_1.z.string().optional(),
    notify: zod_1.z.boolean().optional(),
    cadenceMins: zod_1.z.number().int().positive().max(7 * 24 * 60).optional(),
});
// Build a `where` for listings from our SavedSearch.filters
function buildWhereFromFilters(filters) {
    const f = (filters ?? {});
    const where = {};
    // price
    if (f.price_min != null)
        where.preco = { ...(where.preco ?? {}), gte: Number(f.price_min) };
    if (f.price_max != null)
        where.preco = { ...(where.preco ?? {}), lte: Number(f.price_max) };
    // km
    if (f.km_min != null)
        where.km = { ...(where.km ?? {}), gte: Number(f.km_min) };
    if (f.km_max != null)
        where.km = { ...(where.km ?? {}), lte: Number(f.km_max) };
    // year
    if (f.year_min != null)
        where.ano = { ...(where.ano ?? {}), gte: Number(f.year_min) };
    if (f.year_max != null)
        where.ano = { ...(where.ano ?? {}), lte: Number(f.year_max) };
    // enums / arrays
    if (Array.isArray(f.fuels) && f.fuels.length)
        where.combustivel = { in: f.fuels };
    if (Array.isArray(f.trans) && f.trans.length)
        where.transmissao = { in: f.trans };
    if (Array.isArray(f.locals) && f.locals.length)
        where.local = { in: f.locals };
    // brand / model
    if (f.marca?.trim())
        where.marca = { equals: String(f.marca).trim() };
    if (f.modelo?.trim())
        where.modelo = { equals: String(f.modelo).trim() };
    return where;
}
/* ------------------------------ DEBUG ------------------------------ */
/*
  GET /saved-searches/debug/columns
  Lists columns present in the saved_searches table.
*/
router.get("/debug/columns", async (_req, res) => {
    try {
        const rows = (await db.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'saved_searches'
      ORDER BY column_name;
    `));
        const columns = (rows || []).map((r) => String(r.column_name));
        res.json({ columns });
    }
    catch (e) {
        console.error("[saved-searches] /debug/columns error:", e);
        res
            .status(500)
            .json({ error: "debug_failed", detail: e?.message ?? String(e) });
    }
});
/*
  GET /saved-searches/debug/patch-sync-schema
  Adds required columns if missing (safe/idempotent).
*/
router.get("/debug/patch-sync-schema", async (_req, res) => {
    try {
        // query: TEXT NOT NULL DEFAULT ''
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'query'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "query" TEXT NOT NULL DEFAULT '';
        END IF;
      END$$;
    `);
        // filters: JSONB NOT NULL DEFAULT '{}'
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'filters'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "filters" JSONB NOT NULL DEFAULT '{}'::jsonb;
        END IF;
      END$$;
    `);
        // notify: BOOLEAN NOT NULL DEFAULT false
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'notify'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "notify" BOOLEAN NOT NULL DEFAULT false;
        END IF;
      END$$;
    `);
        // cadence_mins: INT NOT NULL DEFAULT 1440
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'cadence_mins'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "cadence_mins" INTEGER NOT NULL DEFAULT 1440;
        END IF;
      END$$;
    `);
        // last_check: TIMESTAMPTZ NULL
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'last_check'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "last_check" TIMESTAMPTZ NULL;
        END IF;
      END$$;
    `);
        // last_notified: TIMESTAMPTZ NULL
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'last_notified'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "last_notified" TIMESTAMPTZ NULL;
        END IF;
      END$$;
    `);
        // created_at: TIMESTAMPTZ NOT NULL DEFAULT now()
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
        END IF;
      END$$;
    `);
        // updated_at: TIMESTAMPTZ NOT NULL DEFAULT now()
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
        END IF;
      END$$;
    `);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[saved-searches] /debug/patch-sync-schema error:", e);
        res
            .status(500)
            .json({ error: "patch_failed", detail: e?.message ?? String(e) });
    }
});
/*
  GET /saved-searches/debug/patch-add-timestamps
  Adds created_at/updated_at if missing (safe/idempotent).
*/
router.get("/debug/patch-add-timestamps", async (_req, res) => {
    try {
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'saved_searches'
            AND column_name = 'created_at'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
        END IF;
      END$$;
    `);
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'saved_searches'
            AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
        END IF;
      END$$;
    `);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[saved-searches] /debug/patch-add-timestamps error:", e);
        res
            .status(500)
            .json({ error: "patch_failed", detail: e?.message ?? String(e) });
    }
});
/*
  GET /saved-searches/debug/patch-add-all
  Adds all required columns if missing (combo).
*/
router.get("/debug/patch-add-all", async (_req, res) => {
    try {
        // query
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'query'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "query" TEXT NOT NULL DEFAULT '';
        END IF;
      END$$;
    `);
        // filters
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'filters'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "filters" JSONB NOT NULL DEFAULT '{}'::jsonb;
        END IF;
      END$$;
    `);
        // notify
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'notify'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "notify" BOOLEAN NOT NULL DEFAULT false;
        END IF;
      END$$;
    `);
        // cadence_mins
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'cadence_mins'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "cadence_mins" INTEGER NOT NULL DEFAULT 1440;
        END IF;
      END$$;
    `);
        // last_check
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'last_check'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "last_check" TIMESTAMPTZ NULL;
        END IF;
      END$$;
    `);
        // last_notified
        await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'saved_searches' AND column_name = 'last_notified'
        ) THEN
          ALTER TABLE "saved_searches"
          ADD COLUMN "last_notified" TIMESTAMPTZ NULL;
        END IF;
      END$$;
    `);
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[saved-searches] /debug/patch-add-all error:", e);
        res
            .status(500)
            .json({ error: "patch_failed", detail: e?.message ?? String(e) });
    }
});
/* ------------------------------ CRUD ------------------------------ */
/*
  POST /saved-searches
  Body: { email, name, filters, query?, notify?, cadenceMins? }
  Tolerant if DB still lacks "query".
*/
router.post("/", async (req, res) => {
    try {
        const body = PostBody.parse(req.body);
        const created = await db.savedSearch.create({
            data: {
                userEmail: body.email,
                name: body.name,
                filters: body.filters,
                query: body.query,
                notify: body.notify,
                cadenceMins: body.cadenceMins,
            },
        });
        res.status(201).json(created);
    }
    catch (e) {
        if (e?.name === "ZodError") {
            return res.status(400).json({ error: "invalid_body", issues: e.issues });
        }
        console.error(e);
        res.status(500).json({ error: "failed_to_create" });
    }
});
/*
  GET /saved-searches?email=you@example.com
  Returns { items: SavedSearch[] }
  Tolerant if "query" missing.
*/
router.get("/", async (req, res) => {
    try {
        const email = String(req.query.email || "").trim();
        if (!email)
            return res.status(400).json({ error: "email_required" });
        const items = await db.savedSearch.findMany({
            where: { userEmail: email },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                userEmail: true,
                name: true,
                query: true,
                filters: true,
                notify: true,
                cadenceMins: true,
                lastCheck: true,
                lastNotified: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        res.json({ items });
    }
    catch (e) {
        console.error("[saved-searches] GET / failed_to_list:", e);
        res.status(500).json({ error: "failed_to_list" });
    }
});
/*
  GET /saved-searches/:id
  Tolerant if "query" missing.
*/
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const owned = await assertOwnerOr401(req, res, id);
        if (!owned)
            return;
        let item = null;
        try {
            item = await db.savedSearch.findUnique({
                where: { id },
                select: {
                    id: true,
                    userEmail: true,
                    name: true,
                    query: true,
                    filters: true,
                    notify: true,
                    cadenceMins: true,
                    lastCheck: true,
                    lastNotified: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        }
        catch (err) {
            const msg = String(err?.message || err);
            if (msg.includes("saved_searches.query") || msg.includes('column "query"')) {
                const basic = await db.savedSearch.findUnique({
                    where: { id },
                    select: {
                        id: true,
                        userEmail: true,
                        name: true,
                        // query: true,
                        filters: true,
                        notify: true,
                        cadenceMins: true,
                        lastCheck: true,
                        lastNotified: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                });
                item = basic ? { ...basic, query: "" } : null;
            }
            else {
                throw err;
            }
        }
        if (!item)
            return res.status(404).json({ error: "not_found" });
        res.json(item);
    }
    catch (e) {
        console.error("[saved-searches] GET/:id error:", e);
        res
            .status(500)
            .json({ error: "failed_to_get", detail: e?.message ?? String(e) });
    }
});
/*
  PATCH /saved-searches/:id
  Body: { name?, filters?, query?, notify?, cadenceMins? }
  Tolerant if "query" missing.
*/
router.patch("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const owned = await assertOwnerOr401(req, res, id);
        if (!owned)
            return;
        const body = PatchBody.parse(req.body);
        const updated = await db.savedSearch.update({
            where: { id },
            data: body,
        });
        res.json(updated);
    }
    catch (e) {
        if (e?.name === "ZodError") {
            return res.status(400).json({ error: "invalid_body", issues: e.issues });
        }
        console.error(e);
        res.status(500).json({ error: "failed_to_update" });
    }
});
/*
  DELETE /saved-searches/:id
*/
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const owned = await assertOwnerOr401(req, res, id);
        if (!owned)
            return;
        // Clean up related alert events first (FK onDelete: Cascade should handle, but be explicit)
        try {
            await db.alertEvent.deleteMany({ where: { savedSearchId: id } });
        }
        catch (e) {
            console.warn("[saved-searches] warn: deleteMany(alertEvent) failed (ignoring)", e?.message ?? String(e));
        }
        await db.savedSearch.delete({ where: { id } });
        res.json({ ok: true });
    }
    catch (e) {
        console.error("[saved-searches] DELETE error:", e);
        res
            .status(500)
            .json({ error: "failed_to_delete", detail: e?.message ?? String(e) });
    }
});
/*
  GET /saved-searches/:id/new-count
  Returns { count } = number of listings with scraped_at > lastCheck that match filters.
*/
router.get("/:id/new-count", async (req, res) => {
    try {
        const { id } = req.params;
        const owned = await assertOwnerOr401(req, res, id);
        if (!owned)
            return;
        const s = await db.savedSearch.findUnique({ where: { id } });
        if (!s)
            return res.status(404).json({ error: "not_found" });
        // If never checked, we show 0 (baseline not set yet)
        if (!s.lastCheck)
            return res.json({ count: 0 });
        const where = buildWhereFromFilters(s.filters);
        where.scraped_at = { gt: s.lastCheck };
        const count = await db.listings.count({ where });
        res.json({ count });
    }
    catch (e) {
        console.error("[saved-searches] new-count error:", e);
        res
            .status(500)
            .json({ error: "failed_to_count", detail: e?.message ?? String(e) });
    }
});
/* --------------------------- DEBUG HELPERS --------------------------- */
// --- DEBUG: force one search to be due (notify=true + lastCheck 10 minutes ago)
router.get("/:id/debug/force-old", async (req, res) => {
    try {
        const { id } = req.params;
        const old = new Date(Date.now() - 10 * 60 * 1000);
        await db.savedSearch.update({
            where: { id },
            data: { notify: true, lastCheck: old },
        });
        res.json({ ok: true, id, lastCheck: old.toISOString() });
    }
    catch (e) {
        console.error("[saved-searches] force-old error:", e);
        res
            .status(500)
            .json({ error: "force_old_failed", detail: e?.message ?? String(e) });
    }
});
// --- DEBUG: mark 3 listings as 'new' right now (so alerts will trigger)
router.get("/debug/bump-listings", async (_req, res) => {
    try {
        const result = await db.$executeRawUnsafe(`
      UPDATE public.listings
      SET scraped_at = now()
      WHERE id IN (
        SELECT id FROM public.listings
        ORDER BY scraped_at DESC
        LIMIT 3
      )
    `);
        // result may be a number of rows updated (driver-dependent)
        res.json({ ok: true, updated: Number(result) || 0 });
    }
    catch (e) {
        console.error("[saved-searches] bump-listings error:", e);
        res
            .status(500)
            .json({ error: "bump_failed", detail: e?.message ?? String(e) });
    }
});
exports.default = router;
