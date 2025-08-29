// Minimal env validation so the API fails fast with clear messages.
const required = ["DATABASE_URL"];
const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());

if (missing.length) {
  // eslint-disable-next-line no-console
  console.error("[env] Missing required env:", missing.join(", "));
  process.exit(1);
}

export const ENV = {
  DATABASE_URL: String(process.env.DATABASE_URL),
  NODE_ENV: process.env.NODE_ENV || "development",
};
