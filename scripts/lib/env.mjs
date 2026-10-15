import { readFileSync, existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

// Membaca .dev.vars (format KEY="value") supaya script dan wrangler memakai satu file yang sama.
export function loadEnv() {
  const env = { ...process.env };
  if (existsSync(".dev.vars")) {
    for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

export function connect() {
  const env = loadEnv();
  if (!env.DATABASE_URL || env.DATABASE_URL.includes("USER:PASSWORD")) {
    console.error("DATABASE_URL belum diisi. Salin .dev.vars.example menjadi .dev.vars lalu isi connection string Neon.");
    process.exit(1);
  }
  const sql = neon(env.DATABASE_URL);
  return (text, params = []) => sql.query(text, params);
}
