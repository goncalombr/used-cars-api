// src/server.ts
import express from "express";
import cors from "cors";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Robustly pick a router regardless of how the module exported it
function pickRouter(mod: any) {
  return mod?.default ?? mod?.router ?? mod?.authRouter ?? mod?.alertsRouter ?? mod?.savedSearchesRouter ?? mod?.jobsRouter ?? mod?.debugRouter ?? mod;
}

// Import routers (works for both default and named exports)
import * as authMod from "./routes/auth";
import * as alertsMod from "./routes/alerts";
import * as savedSearchesMod from "./routes/savedSearches";
import * as jobsMod from "./routes/jobs";
import * as debugMod from "./routes/debug";

const authRouter = pickRouter(authMod);
const alertsRouter = pickRouter(alertsMod);
const savedSearchesRouter = pickRouter(savedSearchesMod);
const jobsRouter = pickRouter(jobsMod);
const debugRouter = pickRouter(debugMod);

// CommonJS build has __dirname already
const publicDir = path.resolve(__dirname, "..", "public");

// --- basic app ---
const app = express();

// CORS (allow your frontend origin if provided)
const WEB_ORIGIN = process.env.WEB_ORIGIN || "*";
app.use(
  cors({
    origin: WEB_ORIGIN === "*" ? true : WEB_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.set("trust proxy", true);

// ---- /health (never throws) ----
app.get("/health", async (_req, res) => {
  const now = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, time: now, db: "ok" });
  } catch (e: any) {
    res.status(200).json({ ok: false, time: now, db: "down", error: String(e?.message ?? e) });
  }
});

// --------- helpers to build WHERE safely (for simple filters) ----------
function buildWhereFromQuery(q: any) {
  const clauses: string[] = [];
  const params: any[] = [];

  const like = (field: string, v?: string) => {
    if (v) { clauses.push(`${field} ILIKE $${params.length + 1}`); params.push(`%${v}%`); }
  };
  const gte = (field: string, v?: any) => {
    if (v !== undefined && v !== null && v !== "") { clauses.push(`${field} >= $${params.length + 1}`); params.push(v); }
  };
  const lte = (field: string, v?: any) => {
    if (v !== undefined && v !== null && v !== "") { clauses.push(`${field} <= $${params.length + 1}`); params.push(v); }
  };

  like("marca", String(q.marca || "").trim());
  like("modelo", String(q.modelo || "").trim());
  gte("preco", q.price_min ? Number(q.price_min) : undefined);
  lte("preco", q.price_max ? Number(q.price_max) : undefined);
  gte("ano", q.year_min ? Number(q.year_min) : undefined);
  lte("ano", q.year_max ? Number(q.year_max) : undefined);
  like("combustivel", String(q.fuel || "").trim());
  like("transmissao", String(q.trans || "").trim());
  like("local", String(q.local || "").trim());

  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function pageParams(q: any) {
  const page_size = Math.max(1, Math.min(200, Number(q.page_size) || 24));
  const page = Math.max(1, Number(q.page) || 1);
  const offset = (page - 1) * page_size;
  return { page, page_size, offset };
}

// ---------- LISTINGS ----------
app.get("/listings", async (req, res) => {
  try {
    const { where, params } = buildWhereFromQuery(req.query);
    const { page, page_size, offset } = pageParams(req.query);

    const totalRow: any[] = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS n FROM listings ${where}`, ...params
    )) as any[];
    const total = totalRow?.[0]?.n ?? 0;

    const items: any[] = (await prisma.$queryRawUnsafe(
      `
      SELECT id, listing_id, link, marca, modelo, preco, local, ano, km, combustivel, transmissao, scraped_at
      FROM listings
      ${where}
      ORDER BY scraped_at DESC, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      ...params, page_size, offset
    )) as any[];

    res.json({ page, page_size, total, items });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

// ---------- KPIS ----------
app.get("/kpis", async (req, res) => {
  try {
    const { where, params } = buildWhereFromQuery(req.query);
    const rows: any[] = (await prisma.$queryRawUnsafe(
      `
      SELECT
        AVG(preco)::float AS avg_price,
        MIN(preco)::int   AS min_price,
        MAX(preco)::int   AS max_price,
        AVG(km)::float    AS avg_km,
        AVG(ano)::float   AS avg_year,
        COUNT(*)::int     AS count
      FROM listings
      ${where}
      `,
      ...params
    )) as any[];
    const r = rows?.[0] || {};
    res.json({
      avg_price: r.avg_price ?? null,
      min_price: r.min_price ?? null,
      max_price: r.max_price ?? null,
      avg_km: r.avg_km ?? null,
      avg_year: r.avg_year ?? null,
      count: r.count ?? 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

// ---------- FACETS ----------
app.get("/brands", async (_req, res) => {
  try {
    const rows: any[] = (await prisma.$queryRawUnsafe(
      `SELECT DISTINCT marca FROM listings WHERE marca IS NOT NULL AND marca <> '' ORDER BY marca ASC`
    )) as any[];
    res.json({ items: rows.map(r => ({ marca: r.marca })) });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.get("/models", async (req, res) => {
  try {
    const marca = String(req.query.marca || "");
    if (!marca) return res.json({ items: [] });
    const rows: any[] = (await prisma.$queryRawUnsafe(
      `SELECT DISTINCT modelo FROM listings WHERE modelo IS NOT NULL AND modelo <> '' AND marca ILIKE $1 ORDER BY modelo ASC`,
      `%${marca}%`
    )) as any[];
    res.json({ items: rows.map(r => ({ modelo: r.modelo })) });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.get("/facets", async (_req, res) => {
  try {
    const fuelRows: any[] = (await prisma.$queryRawUnsafe(
      `SELECT combustivel AS label, COUNT(*)::int AS n
       FROM listings WHERE combustivel IS NOT NULL AND combustivel <> ''
       GROUP BY combustivel ORDER BY combustivel`
    )) as any[];
    const transRows: any[] = (await prisma.$queryRawUnsafe(
      `SELECT transmissao AS label, COUNT(*)::int AS n
       FROM listings WHERE transmissao IS NOT NULL AND transmissao <> ''
       GROUP BY transmissao ORDER BY transmissao`
    )) as any[];
    const localRows: any[] = (await prisma.$queryRawUnsafe(
      `SELECT local AS label, COUNT(*)::int AS n
       FROM listings WHERE local IS NOT NULL AND local <> ''
       GROUP BY local ORDER BY local`
    )) as any[];

    res.json({ fuel: fuelRows, trans: transRows, locals: localRows });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

// -------- mount existing routers --------
app.use("/auth", authRouter);
app.use("/alerts", alertsRouter);
app.use("/saved-searches", savedSearchesRouter);
app.use("/jobs", jobsRouter);
app.use("/debug", debugRouter);

// -------- static site (public/) --------
app.use(express.static(publicDir, { extensions: ["html"] }));

// root -> public/index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// /dashboard/ -> public/dashboard/index.html
app.get("/dashboard/", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard", "index.html"));
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

// ---------- start ----------
const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
