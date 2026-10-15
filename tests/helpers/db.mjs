// Database uji: PGlite (PostgreSQL di dalam proses Node, tanpa instalasi).
import { readFileSync } from "node:fs";

export async function createTestDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8"));
  const query = async (text, params = []) => {
    const { rows } = await pg.query(text, params);
    return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "bigint" ? String(v) : v])));
  };
  return query;
}
