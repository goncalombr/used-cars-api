import fs from "fs";
import dotenv from "dotenv";

// 1) Load local .env (dev)
dotenv.config();

// 2) If running on Render, Secret Files are mounted under /etc/secrets.
//    Load a whole .env kept there, if present.
const SECRET_ENV = "/etc/secrets/.env";
if (fs.existsSync(SECRET_ENV)) {
  dotenv.config({ path: SECRET_ENV });
}

// 3) Also support single-value secret files, e.g. /etc/secrets/DATABASE_URL
function readSecretFile(name: string): string | undefined {
  const p = `/etc/secrets/${name}`;
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  return undefined;
}

// Populate env vars from single secret files if they’re still missing
process.env.DATABASE_URL ||= readSecretFile("DATABASE_URL");
process.env.CRON_SECRET   ||= readSecretFile("CRON_SECRET");

// Export commonly used flags (optional helpers)
export const ENFORCE_EMAIL =
  (process.env.ENFORCE_EMAIL_OWNERSHIP ?? "") === "1";
export const CRON_SECRET = process.env.CRON_SECRET ?? "";
export const DATABASE_URL = process.env.DATABASE_URL ?? "";
