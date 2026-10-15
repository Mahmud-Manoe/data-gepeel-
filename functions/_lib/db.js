import { neon } from "@neondatabase/serverless";
import { HttpError } from "./http.js";

// Mengembalikan fungsi query(text, params) -> array baris.
// env.__TEST_SQL dipakai oleh tests/ (PGlite), tidak dipakai di produksi.
export function getDb(env) {
  if (env.__TEST_SQL) return env.__TEST_SQL;
  if (!env.DATABASE_URL) throw new HttpError(500, "DATABASE_URL belum diatur di environment.");
  const sql = neon(env.DATABASE_URL);
  return (text, params = []) => sql.query(text, params);
}

export const ITEM_SELECT = `
  SELECT i.id, i.kategori, i.tipe, i.kebutuhan, i.stok, i.stok_min, i.satuan,
         i.no_ppb, i.no_pr, i.no_po, i.balance, i.remark,
         CASE WHEN i.kebutuhan > 0 THEN (CASE WHEN i.stok <= i.stok_min THEN 'ORDER' ELSE 'AMAN' END) ELSE 'NA' END AS status,
         (SELECT count(*)::int FROM attachments a WHERE a.entity_type = 'item' AND a.entity_id = i.id) AS lampiran
  FROM items i`;

export function mapItem(r) {
  return {
    id: r.id, kategori: r.kategori, tipe: r.tipe,
    kebutuhan: Number(r.kebutuhan), stok: Number(r.stok), stok_min: Number(r.stok_min),
    satuan: r.satuan, no_ppb: r.no_ppb, no_pr: r.no_pr, no_po: r.no_po,
    balance: Number(r.balance), remark: r.remark, status: r.status, lampiran: Number(r.lampiran)
  };
}

export const MUTATION_SELECT = `
  SELECT m.id, m.item_id, m.tanggal::text AS tanggal, m.jenis, m.jumlah, m.stok_akhir, m.pic, m.catatan,
         m.kategori, m.tipe, m.satuan, m.created_at::text AS created_at,
         (SELECT json_agg(json_build_object('key', a.r2_key, 'name', a.filename, 'type', a.content_type) ORDER BY a.id)
            FROM attachments a WHERE a.entity_type = 'mutation' AND a.entity_id = m.id::text) AS files
  FROM mutations m`;

export function mapMutation(r) {
  let files = r.files;
  if (typeof files === "string") files = JSON.parse(files);
  return {
    id: Number(r.id), item_id: r.item_id, tanggal: r.tanggal, jenis: r.jenis,
    jumlah: Number(r.jumlah), stok_akhir: Number(r.stok_akhir), pic: r.pic, catatan: r.catatan,
    kategori: r.kategori, tipe: r.tipe, satuan: r.satuan, created_at: r.created_at, files: files || []
  };
}
