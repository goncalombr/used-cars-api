"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
function redactUrl(u) {
    if (!u)
        return { has: false };
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
    }
    catch {
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
        const { PrismaClient } = await Promise.resolve().then(() => __importStar(require("@prisma/client")));
        const prisma = new PrismaClient();
        const rows = (await prisma.$queryRawUnsafe(`select 1 as one`));
        await prisma.$disconnect();
        res.json({ ok: true, rows });
    }
    catch (e) {
        res.status(500).json({ ok: false, message: e?.message ?? String(e) });
    }
});
exports.default = router;
