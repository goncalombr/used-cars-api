// src/server.ts
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { PrismaClient, Prisma } from "@prisma/client";

// Routers (must exist)
import authRoutes from "./routes/auth";
import savedSearchesRouter from "./routes/savedSearches";
import { alertsRouter } from "./routes/alerts";
import { jobsRouter } from "./routes/jobs";
import debugRouter from "./routes/debug";

const ENFORCE_EMAIL = process.env.ENFORCE_EMAIL_OWNERSHIP === "1";
const WEB_ORIGIN =
  (process.env.WEB_ORIGIN ?? "").trim() ||
  "http://localhost:3000"; // allow your frontend during dev

const app = express();
const prisma = new PrismaClient();

/* ----------------------- JSON BigInt -> string ----------------------- */
app.set("json replacer", (_k: string, v: unknown) =>
  typeof v === "bigint" ? v.toString() : v
);

/* ----------------------- Security / CORS / JSON ---------------------- */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: [WEB_ORIGIN, "https://used-cars-api.onrender.com"],
    credentials: true,
  })
);

app.use(express.json());

/* ----------------------- Rate limit (all routes) --------------------- */
const limiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

/* ----------------------- Request ID & dev logging -------------------- */
app.use((req: Request, _res: Response, next: NextFunction) => {
  // @ts-ignore Node 18+ crypto.randomUUID
  const rid =
    (req.headers["x-request-id"] as string) ??
    (global as any).crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2);
  (req as any).requestId = rid;
  next();
});

if (process.env.NODE_ENV !== "production") {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        lvl: "info",
        msg: "req",
        method: req.method,
        path: req.path,
        rid: (req as any).requestId,
      })
    );
    next();
  });
}

/* ----------------------- Enforce email ownership --------------------- */
// Requires callers to send:  x-user-email: <their email>
// Only enforced for /saved-searches and /alerts routes when they pass ?email=
if (ENFORCE_EMAIL) {
  app.use(["/saved-searches", "/alerts"], (req: Request, res: Response, next: NextFunction) => {
    const hdr = String(req.headers["x-user-email"] || "").trim().toLowerCase();
    const q = String((req.query as any).email || "").trim().toLowerCase();
    if (!q) return next(); // only enforce when ?email= is used
    if (!hdr || hdr !== q) {
      return res.status(401).json({ error: "unauthorized_email" });
    }
    next();
  });
}

/* ----------------------- Serve tiny viewer (/public) ----------------- */
// Put an index.html inside /public to navigate listings on your Render URL.
app.use(express.static(path.join(process.cwd(), "public")));

/* ----------------------------- Helpers ------------------------------ */
const num = (v?: string) => (v !== undefined && v !== "" ? Number(v) : null);
const arr = (v?: string) =>
  v && v.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

function buildWhere(q: Record<string, string | undefined>) {
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

  const clauses: Prisma.Sql[] = [];
  if (price_min !== null) clauses.push(Prisma.sql`preco >= ${price_min}`);
  if (price_max !== null) clauses.push(Prisma.sql`preco <= ${price_max}`);
  if (km_min !== null) clauses.push(Prisma.sql`km >= ${km_min}`);
  if (km_max !== null) clauses.push(Prisma.sql`km <= ${km_max}`);
  if (year_min !== null) clauses.push(Prisma.sql`ano >= ${year_min}`);
  if (year_max !== null) clauses.push(Prisma.sql`ano <= ${year_max}`);
  if (marca) clauses.push(Prisma.sql`marca ilike ${"%" + marca + "%"}`);
  if (modelo) clauses.push(Prisma.sql`modelo ilike ${"%" + modelo + "%"}`);

  if (fuels.length) {
    clauses.push(
      Prisma.sql`combustivel IN (${Prisma.join(
        fuels.map((f) => Prisma.sql`${f}`),
        ", "
      )})`
    );
  }
  if (trans.length) {
    clauses.push(
      Prisma.sql`transmissao IN (${Prisma.join(
        trans.map((t) => Prisma.sql`${t}`),
        ", "
      )})`
    );
  }
  if (locals.length) {
    clauses.push(
      Prisma.sql`local IN (${Prisma.join(
        locals.map((l) => Prisma.sql`${l}`),
        ", "
      )})`
    );
  }

  const whereSql = clauses.length ? Prisma.join(clauses, " AND ") : Prisma.sql`true`;
  return { whereSql };
}

function buildSort(sort?: string) {
  switch (sort) {
    case "cheap":
      return Prisma.sql`preco asc`;
    case "exp":
      return Prisma.sql`preco desc`;
    case "lowkm":
      return Prisma.sql`km asc`;
    case "newer":
      return Prisma.sql`ano desc`;
    default:
      return Prisma.sql`scraped_at desc`; // most recent first
  }
}

/* ------------------------------ Routes ------------------------------ */

// Health (robust even if DB is down)
app.get("/health", async (_req: Request, res: Response) => {
  const now = new Date().toISOString();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    res.json({ ok: true, time: now, db: "ok" });
  } catch (e: any) {
    res.status(500).json({
      ok: false,
      time: now,
      db: "down",
      error: process.env.NODE_ENV === "production" ? undefined : e?.message ?? String(e),
    });
  }
});

// Brands (Marca + count)
app.get("/brands", async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.$queryRaw<{ marca: string | null; anuncios: bigint }[]>`
      select marca, count(*)::bigint as anuncios
      from public.listings
      group by marca
      order by anuncios desc nulls last
    `;
    res.json({
      items: rows.map((r) => ({ marca: r.marca, anuncios: Number(r.anuncios) })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed_to_query" });
  }
});

// Models by brand
app.get("/models", async (req: Request, res: Response) => {
  try {
    const marca = ((req.query.marca as string | undefined) ?? "").trim();
    const like = "%" + marca + "%";
    const rows = await prisma.$queryRaw<{ modelo: string | null; anuncios: bigint }[]>`
      select modelo, count(*)::bigint as anuncios
      from public.listings
      where ${marca ? Prisma.sql`marca ilike ${like}` : Prisma.sql`true`}
      group by modelo
      order by anuncios desc nulls last
    `;
    res.json({
      items: rows.map((r) => ({ modelo: r.modelo, anuncios: Number(r.anuncios) })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed_to_query" });
  }
});

// Listings (filters + sorting + pagination)
app.get("/listings", async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const page = num(q.page) ?? 1;
    const page_size = num(q.page_size) ?? 24;
    const offset = (page - 1) * page_size;

    const { whereSql } = buildWhere(q);
    const orderBySql = buildSort(q.sort);

    const items = await prisma.$queryRaw<{
      id: string;
      listing_id: string;
      link: string;
      marca: string | null;
      modelo: string | null;
      ano: number | null;
      km: number | null;
      preco: number | null;
      local: string | null;
      transmissao: string | null;
      combustivel: string | null;
      scraped_at: Date;
    }[]>`
      select
        id::text as id, listing_id, link, marca, modelo, ano, km, preco, local,
        transmissao, combustivel, scraped_at
      from public.listings
      where ${whereSql}
      order by ${orderBySql}
      limit ${page_size} offset ${offset}
    `;

    const totalRows = await prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count
      from public.listings
      where ${whereSql}
    `;
    const total = Number(totalRows[0]?.count ?? 0);

    res.json({ page, page_size, total, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed_to_query" });
  }
});

// KPIs (filtered)
app.get("/kpis", async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const { whereSql } = buildWhere(q);

    const rows = await prisma.$queryRaw<{
      avg_price: number | null;
      min_price: number | null;
      max_price: number | null;
      avg_km: number | null;
      avg_year: number | null;
      avg_days: number | null;
      count: bigint;
    }[]>`
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed_to_query" });
  }
});

// Facets (ignoring their own filter)
app.get("/facets", async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const { whereSql: wFuel } = buildWhere({ ...q, fuel: undefined });
    const { whereSql: wTrans } = buildWhere({ ...q, trans: undefined });
    const { whereSql: wLocal } = buildWhere({ ...q, local: undefined });

    const fuel = await prisma.$queryRaw<{ label: string | null; count: bigint }[]>`
      select combustivel as label, count(*)::bigint as count
      from public.listings
      where ${wFuel}
      group by combustivel
      order by count desc
    `;
    const trans = await prisma.$queryRaw<{ label: string | null; count: bigint }[]>`
      select transmissao as label, count(*)::bigint as count
      from public.listings
      where ${wTrans}
      group by transmissao
      order by count desc
    `;
    const locals = await prisma.$queryRaw<{ label: string | null; count: bigint }[]>`
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed_to_query" });
  }
});

// Charts (safe price histogram; last bucket includes exact max)
app.get("/charts", async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const { whereSql } = buildWhere(q);

    const fuelRows = await prisma.$queryRaw<{ label: string | null; count: bigint }[]>`
      select combustivel as label, count(*)::bigint as count
      from public.listings
      where ${whereSql}
      group by combustivel
      order by count desc
    `;

    const transRows = await prisma.$queryRaw<{ label: string | null; count: bigint }[]>`
      select transmissao as label, count(*)::bigint as count
      from public.listings
      where ${whereSql}
      group by transmissao
      order by count desc
    `;

    const yearRows = await prisma.$queryRaw<{ year: number | null; count: bigint }[]>`
      select ano as year, count(*)::bigint as count
      from public.listings
      where ${whereSql}
      group by ano
      order by year asc nulls last
    `;

    const priceByYearRows = await prisma.$queryRaw<{ year: number | null; avg_price: number | null }[]>`
      select ano as year, avg(preco)::float as avg_price
      from public.listings
      where ${whereSql}
      group by ano
      having ano is not null
      order by year asc
    `;

    const topLocalRows = await prisma.$queryRaw<{ local: string | null; count: bigint }[]>`
      select local, count(*)::bigint as count
      from public.listings
      where ${whereSql}
      group by local
      order by count desc
      limit 10
    `;

    // --- Price histogram ---
    let price_hist: { lo: number; hi: number; count: number }[] = [];

    const mm = await prisma.$queryRaw<{ min: number | null; max: number | null }[]>`
      select min(preco)::float as min, max(preco)::float as max
      from public.listings
      where ${whereSql}
    `;

    const lo = mm[0]?.min ?? null;
    const hi = mm[0]?.max ?? null;

    if (lo != null && hi != null && hi > lo) {
      const buckets = 10;

      const rows = await prisma.$queryRaw<{
        i: number;
        lo: number;
        hi: number;
        count: number;
      }[]>`
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
                (preco >= r.lo and preco < r.hi)            -- normal buckets: [lo, hi)
                or (r.i = ${buckets - 1} and preco = r.hi)  -- last bucket: include exact max
              )
          ) as count
        from ranges r
        order by r.i
      `;
      price_hist = rows.map((r) => ({ lo: r.lo, hi: r.hi, count: r.count }));
    } else if (lo != null && hi != null && hi === lo) {
      const cnt = await prisma.$queryRaw<{ count: bigint }[]>`
        select count(*)::bigint as count
        from public.listings
        where ${whereSql}
      `;
      price_hist = [{ lo: lo as number, hi: lo as number, count: Number(cnt[0]?.count ?? 0) }];
    } else {
      price_hist = [];
    }

    res.json({
      fuel_share: fuelRows.map((r) => ({ label: r.label ?? "—", count: Number(r.count) })),
      trans_share: transRows.map((r) => ({ label: r.label ?? "—", count: Number(r.count) })),
      year_dist: yearRows
        .filter((r) => r.year !== null)
        .map((r) => ({ year: r.year as number, count: Number(r.count) })),
      price_by_year: priceByYearRows
        .filter((r) => r.year !== null && r.avg_price !== null)
        .map((r) => ({ year: r.year as number, avg_price: r.avg_price as number })),
      top_locals: topLocalRows.map((r) => ({ local: r.local ?? "—", count: Number(r.count) })),
      price_hist,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed_to_query" });
  }
});

/* -------------------------- Attach Routers --------------------------- */
app.use(authRoutes);
app.use("/saved-searches", savedSearchesRouter);
app.use("/alerts", alertsRouter);
app.use("/jobs", jobsRouter);
app.use("/debug", debugRouter);

/* ------------------------------ 404 --------------------------------- */
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

/* ------------------------------ Start -------------------------------- */
const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
