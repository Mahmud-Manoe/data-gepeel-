import { getDb, ITEM_SELECT, mapItem } from "../../_lib/db.js";
import { deleteAttachments } from "../../_lib/files.js";
import { HttpError, json, needNumber, readJson, str } from "../../_lib/http.js";

// Stok TIDAK diubah di sini. Stok hanya berubah lewat mutasi (/api/mutations).
export async function onRequestPut({ request, env, params }) {
  const b = await readJson(request);
  const kategori = str(b.kategori, 80), tipe = str(b.tipe, 250);
  if (!kategori || !tipe) throw new HttpError(400, "Kategori dan nama sparepart wajib diisi.");
  const kebutuhan = needNumber(b.kebutuhan ?? 0, "Kebutuhan stok");
  const db = getDb(env);
  const rows = await db(
    `UPDATE items SET kategori = $2, tipe = $3, kebutuhan = $4, satuan = $5, no_ppb = $6, no_pr = $7, no_po = $8,
            balance = $9, remark = $10, updated_at = now()
     WHERE id = $1 RETURNING id`,
    [params.id, kategori, tipe, kebutuhan, str(b.satuan, 20) || "Pcs", str(b.no_ppb, 120), str(b.no_pr, 120), str(b.no_po, 120), Number(b.balance ?? 0) || 0, str(b.remark, 1000)]
  );
  if (!rows.length) throw new HttpError(404, "Sparepart tidak ditemukan.");
  const [row] = await db(`${ITEM_SELECT} WHERE i.id = $1`, [params.id]);
  return json({ item: mapItem(row) });
}

export async function onRequestDelete({ env, params }) {
  const db = getDb(env);
  const rows = await db("SELECT id FROM items WHERE id = $1", [params.id]);
  if (!rows.length) throw new HttpError(404, "Sparepart tidak ditemukan.");
  await deleteAttachments(env, db, "item", params.id);
  await db("DELETE FROM items WHERE id = $1", [params.id]); // riwayat mutasi tetap tersimpan
  return json({ ok: true });
}
