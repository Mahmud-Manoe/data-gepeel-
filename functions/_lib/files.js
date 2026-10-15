// Hapus semua file R2 + baris attachments milik satu entitas.
export async function deleteAttachments(env, db, entityType, entityId) {
  const rows = await db("SELECT r2_key FROM attachments WHERE entity_type = $1 AND entity_id = $2", [entityType, entityId]);
  for (const r of rows) await env.BUCKET.delete(r.r2_key);
  await db("DELETE FROM attachments WHERE entity_type = $1 AND entity_id = $2", [entityType, entityId]);
}
