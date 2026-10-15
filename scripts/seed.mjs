// Memindahkan data awal (data/seed-sparepart.json) ke tabel items di Neon.
//   npm run db:seed          -> hanya jalan bila tabel items masih kosong
//   npm run db:seed:force    -> hapus isi items lalu isi ulang (riwayat mutasi tetap, hanya terlepas dari item)
import { readFileSync } from "node:fs";
import { connect } from "./lib/env.mjs";

const q = connect();
const force = process.argv.includes("--force");
const data = JSON.parse(readFileSync(new URL("../data/seed-sparepart.json", import.meta.url), "utf8"));

const [{ n }] = await q("SELECT count(*)::int AS n FROM items");
if (n > 0 && !force) {
  console.error(`Tabel items sudah berisi ${n} data. Seed dibatalkan. Pakai "npm run db:seed:force" bila memang ingin mengganti.`);
  process.exit(1);
}
if (n > 0) { await q("DELETE FROM items"); console.log(`Menghapus ${n} data lama.`); }

const col = (f) => data.map(f);
await q(
  `INSERT INTO items (id, kategori, tipe, kebutuhan, stok, satuan, no_ppb, no_pr, no_po, balance, remark)
   SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::text[], $7::text[], $8::text[], $9::text[], $10::numeric[], $11::text[])
   ON CONFLICT (id) DO NOTHING`,
  [col((d) => d.id), col((d) => d.k), col((d) => d.t), col((d) => d.keb), col((d) => d.stok), col((d) => d.sat),
   col((d) => d.ppb), col((d) => d.pr), col((d) => d.po), col((d) => d.bal), col((d) => d.rm)]
);
const [{ total }] = await q("SELECT count(*)::int AS total FROM items");
console.log(`Selesai. Tabel items sekarang berisi ${total} sparepart.`);
