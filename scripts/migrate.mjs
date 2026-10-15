// Membuat tabel di Neon dari db/schema.sql. Aman dijalankan berulang.
import { readFileSync } from "node:fs";
import { connect } from "./lib/env.mjs";

const q = connect();
const sqlText = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const statements = sqlText.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);

for (const s of statements) {
  await q(s);
  console.log("OK  ", s.split("\n")[0].slice(0, 70));
}
console.log(`\nSelesai: ${statements.length} perintah dijalankan.`);
