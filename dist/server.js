"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const client_1 = require("@prisma/client");
const auth_1 = __importDefault(require("./routes/auth"));
const savedSearches_1 = __importDefault(require("./routes/savedSearches"));
const alerts_1 = require("./routes/alerts");
const jobs_1 = __importDefault(require("./routes/jobs")); // <-- NEW
const ENFORCE_EMAIL = process.env.ENFORCE_EMAIL_OWNERSHIP === "1";
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
/* ----------------------- Global JSON config ----------------------- */
// Allow JSON to serialize BIGINT (from count(*)::bigint, etc.)
app.set("json replacer", (_k, v) => (typeof v === "bigint" ? v.toString() : v));
/* ----------------------- Middleware ----------------------- */
// Security headers
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
// CORS for your web app
app.use((0, cors_1.default)({
    origin: ["http://localhost:3000"],
    credentials: true,
}));
// Parse JSON
app.use(express_1.default.json());
// Rate limit (all routes) — 120 req/min/IP
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
// Request ID (helps trace errors per request)
app.use((req, _res, next) => {
    // Use existing x-request-id if provided (e.g., by proxies), else generate
    // @ts-ignore: Node 18+ has crypto.randomUUID
    const rid = req.headers["x-request-id"] ??
        global.crypto?.randomUUID?.() ??
        Math.random().toString(36).slice(2);
    req.requestId = rid;
    next();
});
// Simple structured request log (only in development)
if (process.env.NODE_ENV !== "production") {
    app.use((req, _res, next) => {
        console.log(JSON.stringify({
            t: new Date().toISOString(),
            lvl: "info",
            msg: "req",
            method: req.method,
            path: req.path,
            rid: req.requestId,
        }));
        next();
    });
}
// Enforce that callers can only access their own email (?email=...) when enabled
// Requires the frontend to send:  x-user-email: <their email>
if (ENFORCE_EMAIL) {
    app.use(["/saved-searches", "/alerts"], (req, res, next) => {
        const hdr = String(req.headers["x-user-email"] || "").trim().toLowerCase();
        const q = String(req.query.email || "").trim().toLowerCase();
        // Only enforce on routes that use ?email=
        if (!q)
            return next();
        if (!hdr || hdr !== q) {
            return res.status(401).json({ error: "unauthorized_email" });
        }
        next();
    });
}
/* ----------------------- Helpers ----------------------- */
const num = (v) => (v !== undefined && v !== "" ? Number(v) : null);
const arr = (v) => v && v.trim()
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
function buildWhere(q) {
    const price_min = num(q.price_min);
    const price_max = num(q.price_max);
    const km_min = num(q.km_min);
    const km_max = num(q.km_max);
    const year_min = num(q.year_min);
    const year_max = num(q.year_max);
    const fuels = arr(q.fuel);
    const trans = arr(q.trans);
    const locals = arr(q.local);
    const marca = q.marca && q.marca.trim() ? q.marca.trim() : null;
    const modelo = q.modelo && q.modelo.trim() ? q.modelo.trim() : null;
    const clauses = [];
    if (price_min !== null)
        clauses.push(client_1.Prisma.sql `preco >= ${price_min}`);
    if (price_max !== null)
        clauses.push(client_1.Prisma.sql `preco <= ${price_max}`);
    if (km_min !== null)
        clauses.push(client_1.Prisma.sql `km >= ${km_min}`);
    if (km_max !== null)
        clauses.push(client_1.Prisma.sql `km <= ${km_max}`);
    if (year_min !== null)
        clauses.push(client_1.Prisma.sql `ano >= ${year_min}`);
    if (year_max !== null)
        clauses.push(client_1.Prisma.sql `ano <= ${year_max}`);
    if (marca)
        clauses.push(client_1.Prisma.sql `marca ilike ${"%" + marca + "%"}`);
    if (modelo)
        clauses.push(client_1.Prisma.sql `modelo ilike ${"%" + modelo + "%"}`);
    if (fuels.length) {
        clauses.push(client_1.Prisma.sql `combustivel IN (${client_1.Prisma.join(fuels.map((f) => client_1.Prisma.sql `${f}`), ", ")})`);
    }
    if (trans.length) {
        clauses.push(client_1.Prisma.sql `transmissao IN (${client_1.Prisma.join(trans.map((t) => client_1.Prisma.sql `${t}`), ", ")})`);
    }
    if (locals.length) {
        clauses.push(client_1.Prisma.sql `local IN (${client_1.Prisma.join(locals.map((l) => client_1.Prisma.sql `${l}`), ", ")})`);
    }
    const whereSql = clauses.length ? client_1.Prisma.join(clauses, " AND ") : client_1.Prisma.sql `true`;
    return { whereSql };
}
function buildSort(sort) {
    switch (sort) {
        case "cheap":
            return client_1.Prisma.sql `preco asc`;
        case "exp":
            return client_1.Prisma.sql `preco desc`;
        case "lowkm":
            return client_1.Prisma.sql `km asc`;
        case "newer":
            return client_1.Prisma.sql `ano desc`;
        default:
            return client_1.Prisma.sql `scraped_at desc`; // recent
    }
}
/* ------------------------ Routes ------------------------ */
// Health with DB probe
app.get('/health', async (_req, res) => {
    const now = new Date().toISOString();
    try {
        // Try a super-light DB probe, but don't crash even if it fails.
        await prisma.$queryRawUnsafe('SELECT 1');
        return res.json({ ok: true, time: now, db: 'ok' });
    }
    catch (e) {
        // Still return ok:true so Render health checks don’t kill the process,
        // but report db: 'down' so you can see it.
        console.error('[health] probe failed:', e?.message ?? String(e));
        return res.json({ ok: true, time: now, db: 'down' });
    }
});
// Brands list (Marca + count)
app.get("/brands", async (_req, res) => {
    try {
        const rows = await prisma.$queryRaw `
      select marca, count(*)::bigint as anuncios
      from public.listings
      group by marca
      order by anuncios desc nulls last
    `;
        res.json({
            items: rows.map((r) => ({ marca: r.marca, anuncios: Number(r.anuncios) })),
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "failed_to_query" });
    }
});
// Models list for a given brand (Modelo + count)
app.get("/models", async (req, res) => {
    try {
        const marca = (req.query.marca ?? "").trim();
        const like = "%" + marca + "%";
        const rows = await prisma.$queryRaw `
      select modelo, count(*)::bigint as anuncios
      from public.listings
      where ${marca ? client_1.Prisma.sql `marca ilike ${like}` : client_1.Prisma.sql `true`}
      group by modelo
      order by anuncios desc nulls last
    `;
        res.json({
            items: rows.map((r) => ({ modelo: r.modelo, anuncios: Number(r.anuncios) })),
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "failed_to_query" });
    }
});
// Listings with filters + sorting + pagination
app.get("/listings", async (req, res) => {
    try {
        const q = req.query;
        const page = num(q.page) ?? 1;
        const page_size = num(q.page_size) ?? 24;
        const offset = (page - 1) * page_size;
        const { whereSql } = buildWhere(q);
        const orderBySql = buildSort(q.sort);
        const items = await prisma.$queryRaw `
      select
        id::text as id, listing_id, link, marca, modelo, ano, km, preco, local,
        transmissao, combustivel, scraped_at
      from public.listings
      where ${whereSql}
      order by ${orderBySql}
      limit ${page_size} offset ${offset}
    `;
        const totalRows = await prisma.$queryRaw `
      select count(*)::bigint as count
      from public.listings
      where ${whereSql}
    `;
        const total = Number(totalRows[0]?.count ?? 0);
        res.json({ page, page_size, total, items });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "failed_to_query" });
    }
});
// KPIs with same filters
app.get("/kpis", async (req, res) => {
    try {
        const q = req.query;
        const { whereSql } = buildWhere(q);
        const rows = await prisma.$queryRaw `
      select
        avg(preco)::float                                          as avg_price,
        min(preco)::float                                          as min_price,
        max(preco)::float                                          as max_price,
        avg(km)::float                                             as avg_km,
        avg(ano)::float                                            as avg_year,
        avg(extract(epoch from (now() - scraped_at))/86400)::float as avg_days,
        count(*)::bigint                                           as count
      from public.listings
      where ${whereSql}
    `;
        const r = rows[0];
        res.json({
            avg_price: r?.avg_price ?? null,
            min_price: r?.min_price ?? null,
            max_price: r?.max_price ?? null,
            avg_km: r?.avg_km ?? null,
            avg_year: r?.avg_year ?? null,
            avg_days: r?.avg_days ?? null,
            count: r ? Number(r.count) : 0,
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "failed_to_query" });
    }
});
// Facets that ignore their own filter (so options don't vanish)
app.get("/facets", async (req, res) => {
    try {
        const q = req.query;
        const { whereSql: wFuel } = buildWhere({ ...q, fuel: undefined });
        const { whereSql: wTrans } = buildWhere({ ...q, trans: undefined });
        const { whereSql: wLocal } = buildWhere({ ...q, local: undefined });
        const fuel = await prisma.$queryRaw `
      select combustivel as label, count(*)::bigint as count
      from public.listings
      where ${wFuel}
      group by combustivel
      order by count desc
    `;
        const trans = await prisma.$queryRaw `
      select transmissao as label, count(*)::bigint as count
      from public.listings
      where ${wTrans}
      group by transmissao
      order by count desc
    `;
        const locals = await prisma.$queryRaw `
      select local as label, count(*)::bigint as count
      from public.listings
      where ${wLocal}
      group by local
      order by count desc
      limit 50
    `;
        res.json({
            fuel: fuel.map((r) => ({ label: r.label ?? "—", count: Number(r.count) })),
            trans: trans.map((r) => ({ label: r.label ?? "—", count: Number(r.count) })),
            locals: locals.map((r) => ({ label: r.label ?? "—", count: Number(r.count) })),
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "failed_to_query" });
    }
});
// Charts (with safe price histogram — last bucket includes exact max)
app.get("/charts", async (req, res) => {
    try {
        const q = req.query;
        const { whereSql } = buildWhere(q);
        const fuelRows = await prisma.$queryRaw `
      select combustivel as label, count(*)::bigint as count
      from public.listings
      where ${whereSql}
      group by combustivel
      order by count desc
    `;
        const transRows = await prisma.$queryRaw `
      select transmissao as label, count(*)::bigint as count
      from public.listings
      where ${whereSql}
      group by transmissao
      order by count desc
    `;
        const yearRows = await prisma.$queryRaw `
      select ano as year, count(*)::bigint as count
      from public.listings
      where ${whereSql}
      group by ano
      order by year asc nulls last
    `;
        const priceByYearRows = await prisma.$queryRaw `
      select ano as year, avg(preco)::float as avg_price
      from public.listings
      where ${whereSql}
      group by ano
      having ano is not null
      order by year asc
    `;
        const topLocalRows = await prisma.$queryRaw `
      select local, count(*)::bigint as count
      from public.listings
      where ${whereSql}
      group by local
      order by count desc
      limit 10
    `;
        // --- Price histogram (safe for min==max or no data; last bucket inclusive) ---
        let price_hist = [];
        const mm = await prisma.$queryRaw `
      select min(preco)::float as min, max(preco)::float as max
      from public.listings
      where ${whereSql}
    `;
        const lo = mm[0]?.min ?? null;
        const hi = mm[0]?.max ?? null;
        if (lo != null && hi != null && hi > lo) {
            const buckets = 10;
            const rows = await prisma.$queryRaw `
        with bounds as (
          select ${lo}::float as lo, ${hi}::float as hi
        ),
        widths as (
          select lo, hi, (hi - lo) / ${buckets}::float as step from bounds
        ),
        series as (
          select generate_series(0, ${buckets} - 1) as i, lo, hi, step from widths
        ),
        ranges as (
          select i, (lo + i * step) as lo, (lo + (i + 1) * step) as hi
          from series
        )
        select
          r.i, r.lo, r.hi,
          (
            select count(*)::int
            from public.listings
            where ${whereSql}
              and preco is not null
              and (
                (preco >= r.lo and preco < r.hi)           -- normal buckets: [lo, hi)
                or (r.i = ${buckets - 1} and preco = r.hi) -- last bucket: include exact max
              )
          ) as count
        from ranges r
        order by r.i
      `;
            price_hist = rows.map((r) => ({ lo: r.lo, hi: r.hi, count: r.count }));
        }
        else if (lo != null && hi != null && hi === lo) {
            const cnt = await prisma.$queryRaw `
        select count(*)::bigint as count
        from public.listings
        where ${whereSql}
      `;
            price_hist = [
                { lo: lo, hi: lo, count: Number(cnt[0]?.count ?? 0) },
            ];
        }
        else {
            price_hist = [];
        }
        res.json({
            fuel_share: fuelRows.map((r) => ({ label: r.label ?? "—", count: Number(r.count) })),
            trans_share: transRows.map((r) => ({ label: r.label ?? "—", count: Number(r.count) })),
            year_dist: yearRows
                .filter((r) => r.year !== null)
                .map((r) => ({ year: r.year, count: Number(r.count) })),
            price_by_year: priceByYearRows
                .filter((r) => r.year !== null && r.avg_price !== null)
                .map((r) => ({ year: r.year, avg_price: r.avg_price })),
            top_locals: topLocalRows.map((r) => ({ local: r.local ?? "—", count: Number(r.count) })),
            price_hist,
        });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: "failed_to_query" });
    }
});
/* ------------------------ Routers ------------------------ */
app.use(auth_1.default);
app.use("/saved-searches", savedSearches_1.default);
app.use("/alerts", alerts_1.alertsRouter);
app.use("/jobs", jobs_1.default); // <-- NEW
/* ------------------------ 404 & start ------------------------ */
app.use((req, res) => {
    res.status(404).json({ error: "not_found", path: req.path });
});
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
});
