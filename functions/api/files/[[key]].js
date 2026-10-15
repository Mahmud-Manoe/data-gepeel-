import { getDb } from "../../_lib/db.js";
import { HttpError, json } from "../../_lib/http.js";

const keyOf = (params) => [].concat(params.key || []).join("/");

// Mengunduh / menampilkan file:  GET /api/files/item/SP-0001/<uuid>-foto.jpg
export async function onRequestGet({ env, params }) {
  const key = keyOf(params);
  const obj = await env.BUCKET.get(key);
  if (!obj) throw new HttpError(404, "File tidak ditemukan.");
  const rows = await getDb(env)("SELECT filename, content_type FROM attachments WHERE r2_key = $1", [key]);
  const name = rows[0]?.filename || "file";
  return new Response(obj.body, {
    headers: {
      "content-type": rows[0]?.content_type || obj.httpMetadata?.contentType || "application/octet-stream",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff"
    }
  });
}

export async function onRequestDelete({ env, params }) {
  const key = keyOf(params);
  const db = getDb(env);
  const rows = await db("DELETE FROM attachments WHERE r2_key = $1 RETURNING id", [key]);
  if (!rows.length) throw new HttpError(404, "File tidak ditemukan.");
  await env.BUCKET.delete(key);
  return json({ ok: true });
}
