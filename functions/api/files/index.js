import { getDb } from "../../_lib/db.js";
import { HttpError, json, str } from "../../_lib/http.js";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const mapFile = (r) => ({ id: Number(r.id), key: r.r2_key, name: r.filename, type: r.content_type, size: Number(r.size_bytes), created_at: r.created_at });
const FILE_COLS = "id, r2_key, filename, content_type, size_bytes, created_at::text AS created_at";

// Daftar lampiran:  GET /api/files?entity_type=item&entity_id=SP-0001
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const type = u.searchParams.get("entity_type"), id = u.searchParams.get("entity_id");
  if (!["item", "mutation"].includes(type) || !id) throw new HttpError(400, "entity_type dan entity_id wajib diisi.");
  const rows = await getDb(env)(`SELECT ${FILE_COLS} FROM attachments WHERE entity_type = $1 AND entity_id = $2 ORDER BY id`, [type, id]);
  return json({ files: rows.map(mapFile) });
}

// Unggah ke R2:  multipart/form-data  field: entity_type, entity_id, file
export async function onRequestPost({ request, env }) {
  if (!env.BUCKET) throw new HttpError(500, "R2 belum terhubung (binding BUCKET).");
  const form = await request.formData();
  const type = str(form.get("entity_type"), 20), id = str(form.get("entity_id"), 60);
  const file = form.get("file");
  if (!["item", "mutation"].includes(type) || !id) throw new HttpError(400, "entity_type dan entity_id wajib diisi.");
  if (!file || typeof file === "string") throw new HttpError(400, "File belum dipilih.");
  if (!ALLOWED.has(file.type)) throw new HttpError(415, "Hanya JPG, PNG, WebP, atau PDF yang diizinkan.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Ukuran file maksimal 8 MB.");

  const db = getDb(env);
  const exists = type === "item"
    ? await db("SELECT 1 FROM items WHERE id = $1", [id])
    : await db("SELECT 1 FROM mutations WHERE id = $1::bigint", [id]);
  if (!exists.length) throw new HttpError(404, "Data induk lampiran tidak ditemukan.");

  const safe = (file.name || "file").replace(/[^\w.\-]+/g, "_").slice(-80);
  const key = `${type}/${id}/${crypto.randomUUID()}-${safe}`;
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const rows = await db(
    `INSERT INTO attachments (entity_type, entity_id, r2_key, filename, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FILE_COLS}`,
    [type, id, key, file.name || safe, file.type, file.size]
  );
  return json({ file: mapFile(rows[0]) }, 201);
}
