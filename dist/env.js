"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATABASE_URL = exports.CRON_SECRET = exports.ENFORCE_EMAIL = void 0;
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load local .env for dev
dotenv_1.default.config();
// Also load Render Secret File if present
const SECRET_ENV = "/etc/secrets/.env";
if (fs_1.default.existsSync(SECRET_ENV)) {
    dotenv_1.default.config({ path: SECRET_ENV });
}
// Support single secret files (e.g., /etc/secrets/DATABASE_URL)
function readSecretFile(name) {
    const p = `/etc/secrets/${name}`;
    if (fs_1.default.existsSync(p))
        return fs_1.default.readFileSync(p, "utf8").trim();
    return undefined;
}
(_a = process.env).DATABASE_URL || (_a.DATABASE_URL = readSecretFile("DATABASE_URL"));
(_b = process.env).CRON_SECRET || (_b.CRON_SECRET = readSecretFile("CRON_SECRET"));
// Optional exports (not required elsewhere)
exports.ENFORCE_EMAIL = (process.env.ENFORCE_EMAIL_OWNERSHIP ?? "") === "1";
exports.CRON_SECRET = process.env.CRON_SECRET ?? "";
exports.DATABASE_URL = process.env.DATABASE_URL ?? "";
