// Uji API end-to-end terhadap PostgreSQL uji (PGlite) dan R2 tiruan.
// Jalankan:  npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./helpers/db.mjs";

import { onRequest as middleware } from "../functions/api/_middleware.js";
import * as login from "../functions/api/auth/login.js";
import * as me from "../functions/api/auth/me.js";
import * as items from "../functions/api/items/index.js";
import * as item from "../functions/api/items/[id].js";
import * as mutations from "../functions/api/mutations/index.js";
import * as files from "../functions/api/files/index.js";
import * as fileKey from "../functions/api/files/[[key]].js";

const sql = await createTestDb();
await sql(`INSERT INTO items (id,kategori,tipe,kebutuhan,stok,satuan) VALUES
  ('SP-0001','Bearing','6205 ZZ',17,10,'Pcs'), ('SP-0002','Oli & Grease','Oli A',10,2,'Liter')`);

const store = new Map();
const BUCKET = {
  put: async (k, body, o) => store.set(k, { body, o }),
  get: async (k) => (store.has(k) ? { body: store.get(k).body, httpMetadata: store.get(k).o.httpMetadata } : null),
  delete: async (k) => store.delete(k)
};
const env = { __TEST_SQL: sql, BUCKET, APP_PASSWORD: "rahasia", SESSION_SECRET: "x".repeat(40) };
let cookie = "";

// Menjalankan middleware lalu handler, seperti Cloudflare Pages Functions.
async function call(mod, method, path, { body, form, params = {} } = {}) {
  const headers = new Headers(cookie ? { cookie } : {});
  let b;
  if (form) b = form; else if (body !== undefined) { headers.set("content-type", "application/json"); b = JSON.stringify(body); }
  const request = new Request(`https://app.test${path}`, { method, headers, body: b });
  const handler = mod[`onRequest${method[0] + method.slice(1).toLowerCase()}`];
  const res = await middleware({ request, env, params, next: () => handler({ request, env, params }) });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : res;
  return { status: res.status, data, res };
}

test("API menolak akses tanpa login", async () => {
  assert.equal((await call(items, "GET", "/api/items")).status, 401);
});

test("login: password salah ditolak, benar mendapat cookie", async () => {
  assert.equal((await call(login, "POST", "/api/auth/login", { body: { password: "salah" } })).status, 401);
  const r = await call(login, "POST", "/api/auth/login", { body: { password: "rahasia" } });
  assert.equal(r.status, 200);
  cookie = r.res.headers.get("set-cookie").split(";")[0];
  assert.equal((await call(me, "GET", "/api/auth/me")).data.authenticated, true);
});

test("daftar item membawa stok minimal 40% dibulatkan ke atas dan status", async () => {
  const { data } = await call(items, "GET", "/api/items");
  const a = data.items.find((i) => i.id === "SP-0001"), b = data.items.find((i) => i.id === "SP-0002");
  assert.equal(a.stok_min, 7);      // 17 * 0.4 = 6.8 -> 7
  assert.equal(a.status, "AMAN");   // stok 10 > 7
  assert.equal(b.stok_min, 4);
  assert.equal(b.status, "ORDER");  // stok 2 <= 4
});

test("mutasi IN menambah stok dan tercatat dengan PIC", async () => {
  const r = await call(mutations, "POST", "/api/mutations", { body: { item_id: "SP-0002", jenis: "IN", jumlah: 5, pic: "Budi", tanggal: "2026-10-14", catatan: "PO-1" } });
  assert.equal(r.status, 201);
  assert.equal(r.data.item.stok, 7);
  assert.equal(r.data.item.status, "AMAN");
  assert.equal(r.data.mutation.stok_akhir, 7);
  assert.equal(r.data.mutation.pic, "Budi");
  assert.equal(r.data.mutation.tanggal, "2026-10-14");
});

test("mutasi OUT melebihi stok ditolak dan stok tidak berubah", async () => {
  const r = await call(mutations, "POST", "/api/mutations", { body: { item_id: "SP-0002", jenis: "OUT", jumlah: 999, pic: "Budi" } });
  assert.equal(r.status, 409);
  const { data } = await call(items, "GET", "/api/items");
  assert.equal(data.items.find((i) => i.id === "SP-0002").stok, 7);
});

test("mutasi OUT valid mengurangi stok; validasi input", async () => {
  const ok = await call(mutations, "POST", "/api/mutations", { body: { item_id: "SP-0002", jenis: "OUT", jumlah: 4, pic: "Sari" } });
  assert.equal(ok.data.item.stok, 3);
  assert.equal(ok.data.item.status, "ORDER");
  assert.equal((await call(mutations, "POST", "/api/mutations", { body: { item_id: "SP-0002", jenis: "OUT", jumlah: 1, pic: "" } })).status, 400);
  assert.equal((await call(mutations, "POST", "/api/mutations", { body: { item_id: "SP-0002", jenis: "XX", jumlah: 1, pic: "A" } })).status, 400);
  assert.equal((await call(mutations, "POST", "/api/mutations", { body: { item_id: "SP-0002", jenis: "IN", jumlah: -2, pic: "A" } })).status, 400);
  assert.equal((await call(mutations, "POST", "/api/mutations", { body: { item_id: "NOPE", jenis: "IN", jumlah: 1, pic: "A" } })).status, 404);
  const list = await call(mutations, "GET", "/api/mutations");
  assert.equal(list.data.mutations.length, 2);
  assert.equal(list.data.mutations[0].jenis, "OUT"); // terbaru di atas
});

test("edit item mengubah dokumen tetapi tidak mengubah stok", async () => {
  const r = await call(item, "PUT", "/api/items/SP-0001", { params: { id: "SP-0001" }, body: { kategori: "Bearing", tipe: "6205 ZZ", kebutuhan: 20, satuan: "Pcs", no_ppb: "PPB-1", no_pr: "PR-1", no_po: "PO-1", balance: 5, remark: "ok", stok: 9999 } });
  assert.equal(r.status, 200);
  assert.equal(r.data.item.stok, 10);
  assert.equal(r.data.item.stok_min, 8);
  assert.equal(r.data.item.no_po, "PO-1");
});

test("tambah item mendapat ID otomatis", async () => {
  const r = await call(items, "POST", "/api/items", { body: { kategori: "Chain", tipe: "RS60", kebutuhan: 3, stok: 1, satuan: "Pcs" } });
  assert.equal(r.status, 201);
  assert.match(r.data.item.id, /^SP-\d{4}$/);
  assert.equal((await call(items, "POST", "/api/items", { body: { kategori: "", tipe: "x" } })).status, 400);
});

test("lampiran: unggah ke R2, daftar, unduh, hapus", async () => {
  const form = new FormData();
  form.set("entity_type", "item"); form.set("entity_id", "SP-0001");
  form.set("file", new File([new Uint8Array([1, 2, 3])], "foto bearing.png", { type: "image/png" }));
  const up = await call(files, "POST", "/api/files", { form });
  assert.equal(up.status, 201);
  const key = up.data.file.key;
  assert.ok(store.has(key));
  assert.equal((await call(items, "GET", "/api/items")).data.items.find((i) => i.id === "SP-0001").lampiran, 1);
  assert.equal((await call(files, "GET", "/api/files?entity_type=item&entity_id=SP-0001")).data.files.length, 1);
  const dl = await call(fileKey, "GET", `/api/files/${key}`, { params: { key: key.split("/") } });
  assert.equal(dl.status, 200);
  assert.equal(dl.res.headers.get("content-type"), "image/png");

  const bad = new FormData();
  bad.set("entity_type", "item"); bad.set("entity_id", "SP-0001");
  bad.set("file", new File(["x"], "virus.exe", { type: "application/x-msdownload" }));
  assert.equal((await call(files, "POST", "/api/files", { form: bad })).status, 415);

  assert.equal((await call(fileKey, "DELETE", `/api/files/${key}`, { params: { key: key.split("/") } })).status, 200);
  assert.equal(store.has(key), false);
});

test("hapus item membersihkan lampiran dan menyisakan riwayat mutasi", async () => {
  const form = new FormData();
  form.set("entity_type", "item"); form.set("entity_id", "SP-0002");
  form.set("file", new File(["%PDF"], "po.pdf", { type: "application/pdf" }));
  const up = await call(files, "POST", "/api/files", { form });
  assert.equal(up.status, 201);
  assert.equal((await call(item, "DELETE", "/api/items/SP-0002", { params: { id: "SP-0002" } })).status, 200);
  assert.equal(store.has(up.data.file.key), false);
  const list = await call(mutations, "GET", "/api/mutations");
  assert.equal(list.data.mutations.length, 2);
  assert.equal(list.data.mutations[0].item_id, null);
});
