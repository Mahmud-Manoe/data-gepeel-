import { getDb, ITEM_SELECT, mapItem } from "../../_lib/db.js";
import { HttpError, json, needNumber, readJson, str } from "../../_lib/http.js";

export async function onRequestGet({ env }) {
  const db = getDb(env);
  const rows = await db(`${ITEM_SELECT} ORDER BY i.kategori, i.tipe`);
  return json({ items: rows.map(mapItem) });
}

export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const kategori = str(b.kategori, 80), tipe = str(b.tipe, 250);
  if (!kategori || !tipe) throw new HttpError(400, "Kategori dan nama sparepart wajib diisi.");
  const kebutuhan = needNumber(b.kebutuhan ?? 0, "Kebutuhan stok");
  const stok = needNumber(b.stok ?? 0, "Stok awal");
  const balance = Number(b.balance ?? 0) || 0;
  const db = getDb(env);
  const [{ id }] = await db(
    `INSERT INTO items (id, kategori, tipe, kebutuhan, stok, satuan, no_ppb, no_pr, no_po, balance, remark)
     VALUES ('SP-' || to_char(nextval('item_id_seq'), 'FM0000'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [kategori, tipe, kebutuhan, stok, str(b.satuan, 20) || "Pcs", str(b.no_ppb, 120), str(b.no_pr, 120), str(b.no_po, 120), balance, str(b.remark, 1000)]
  );
  const [row] = await db(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
  return json({ item: mapItem(row) }, 201);
}
