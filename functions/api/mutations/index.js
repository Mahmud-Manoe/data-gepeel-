import { getDb, ITEM_SELECT, MUTATION_SELECT, mapItem, mapMutation } from "../../_lib/db.js";
import { HttpError, json, needNumber, readJson, str } from "../../_lib/http.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 1), 1000);
  const db = getDb(env);
  const rows = await db(`${MUTATION_SELECT} ORDER BY m.created_at DESC, m.id DESC LIMIT $1`, [limit]);
  return json({ mutations: rows.map(mapMutation) });
}

// Mencatat IN / OUT. Stok berubah dan baris riwayat dibuat dalam SATU perintah SQL (atomik),
// OUT ditolak bila melebihi stok, tanpa risiko dua orang mengurangi stok yang sama bersamaan.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const jenis = str(b.jenis, 3).toUpperCase();
  if (jenis !== "IN" && jenis !== "OUT") throw new HttpError(400, "Jenis mutasi harus IN atau OUT.");
  const jumlah = needNumber(b.jumlah, "Jumlah", { min: 0.0000001 });
  const pic = str(b.pic, 120);
  if (!pic) throw new HttpError(400, "PIC wajib diisi.");
  const itemId = str(b.item_id, 40);
  const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(str(b.tanggal, 10)) ? b.tanggal : null;
  const db = getDb(env);

  const rows = await db(
    `WITH upd AS (
       UPDATE items SET stok = stok + $2::numeric, updated_at = now()
       WHERE id = $1 AND stok + $2::numeric >= 0
       RETURNING id, kategori, tipe, satuan, stok
     )
     INSERT INTO mutations (item_id, tanggal, jenis, jumlah, stok_akhir, pic, catatan, kategori, tipe, satuan)
     SELECT id, COALESCE($3::date, current_date), $4, $5::numeric, stok, $6, $7, kategori, tipe, satuan FROM upd
     RETURNING id`,
    [itemId, jenis === "IN" ? jumlah : -jumlah, tanggal, jenis, jumlah, pic, str(b.catatan, 500)]
  );
  if (!rows.length) {
    const exists = await db("SELECT stok, satuan FROM items WHERE id = $1", [itemId]);
    if (!exists.length) throw new HttpError(404, "Sparepart tidak ditemukan.");
    throw new HttpError(409, `Jumlah OUT melebihi stok sekarang (${Number(exists[0].stok)} ${exists[0].satuan}).`);
  }
  const [m] = await db(`${MUTATION_SELECT} WHERE m.id = $1`, [rows[0].id]);
  const [item] = await db(`${ITEM_SELECT} WHERE i.id = $1`, [itemId]);
  return json({ mutation: mapMutation(m), item: mapItem(item) }, 201);
}
