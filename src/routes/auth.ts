import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();
const router = Router();

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "change-me";
const WEB_BASE_URL = process.env.WEB_BASE_URL || "http://localhost:3000";

/**
 * POST /admin/invite
 * Headers: x-admin-key: <ADMIN_API_KEY>
 * Body: { email: string, role?: "user" | "admin" }
 * Returns: { invite_url: string }
 */
router.post("/admin/invite", async (req, res) => {
  try {
    const key = req.header("x-admin-key");
    if (key !== ADMIN_API_KEY) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email required" });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7d

    await prisma.invite.create({
      data: { email, token, expiresAt },
    });

    const invite_url = `${WEB_BASE_URL}/invite/${token}`;
    return res.json({ invite_url });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server error" });
  }
});

/**
 * POST /auth/complete-invite
 * Body: { token: string, name?: string, password: string }
 * Returns: { ok: true, user: { id, email, name } }
 */
router.post("/auth/complete-invite", async (req, res) => {
  try {
    const { token, name, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: "token and password required" });
    }

    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) return res.status(400).json({ error: "invalid token" });
    if (invite.usedAt) return res.status(400).json({ error: "token already used" });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: "token expired" });

    const passwordHash = await bcrypt.hash(String(password), 10);

    const user = await prisma.user.upsert({
      where: { email: invite.email },
      update: { passwordHash, name: name ?? undefined },
      create: { email: invite.email, name: name ?? null, passwordHash },
    });

    await prisma.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    return res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server error" });
  }
});

/**
 * POST /auth/verify
 * Body: { email: string, password: string }
 * Returns (200): { id, email, name, role }  OR  (401) { error: "invalid" }
 */
router.post("/auth/verify", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "missing" });

    const user = await prisma.user.findUnique({ where: { email: String(email) } });
    if (!user) return res.status(401).json({ error: "invalid" });

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid" });

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "server error" });
  }
});

export default router;
