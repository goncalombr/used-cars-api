import fs from "fs";
import dotenv from "dotenv";

// Load local .env for dev
dotenv.config();

// Also load Render Secret File if present
const SECRET_ENV = "/etc/secrets/.env";
if (fs.existsSync(SECRET_ENV)) {
  dotenv.config({ path: SECRET_ENV });
}

// Support single secret files (e.g., /etc/secrets/DATABASE_URL)
function readSecretFile(name: string): string | undefined {
  const p = `/etc/secrets/${name}`;
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  return undefined;
}

process.env.DATABASE_URL ||= readSecretFile("DATABASE_URL");
process.env.CRON_SECRET   ||= readSecretFile("CRON_SECRET");

// Optional exports (not required elsewhere)
export const ENFORCE_EMAIL =
  (process.env.ENFORCE_EMAIL_OWNERSHIP ?? "") === "1";
export const CRON_SECRET = process.env.CRON_SECRET ?? "";
export const DATABASE_URL = process.env.DATABASE_URL ?? "";
