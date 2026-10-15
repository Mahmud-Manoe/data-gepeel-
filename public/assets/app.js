// Monitoring Sparepart Gudang - front-end (tanpa framework).
// Semua data berasal dari API (/api/*) yang membaca Neon dan R2.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", '"': "\u0026quot;", "'": "\u0026#39;" }[c]));
const fmt = (n) => (Math.round(Number(n) * 100) / 100).toLocaleString("id-ID");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/* ---------- API ---------- */
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
export async function api(path, { method = "GET", body, form } = {}) {
  const opt = { method, credentials: "same-origin", headers: {} };
  if (form) opt.body = form;
  else if (body !== undefined) { opt.headers["content-type"] = "application/json"; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(`/api${path}`, opt); }
  catch { throw new ApiError(0, "Tidak bisa terhubung ke server."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Gagal (${res.status})`);
  return data;
}
export const fileUrl = (key) => `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;

/* ---------- state ---------- */
export const S = { items: [], log: [], q: "", k: "", s: "", sort: { key: "status", dir: 1 }, page: 1, per: 25 };
export const minOf = (i) => i.stok_min;
export const statusOf = (i) => i.status;
export const ratio = (i) => (i.stok_min > 0 ? i.stok / i.stok_min : 9);
export const cats = () => [...new Set(S.items.map((i) => i.kategori))];

/* ---------- toast & guard ---------- */
export function toast(t) { const e = document.createElement("div"); e.className = "toast"; e.textContent = t; $("toastBox").appendChild(e); setTimeout(() => e.remove(), 2800); }
export const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { if (e.status !== 401) toast(e.message || "Terjadi kesalahan"); } };

/* ---------- badges ---------- */
export function docBadge(i) { return i.no_po ? `<span class="badge b-po">Sudah PO</span>` : i.no_pr ? `<span class="badge b-pr">Sudah PR</span>` : i.no_ppb ? `<span class="badge b-pr">PPB terbit</span>` : `<span class="badge b-order">Belum ada PR</span>`; }
export function stBadge(st) { return st === "ORDER" ? `<span class="badge b-order">⚠️ ORDER</span>` : st === "AMAN" ? `<span class="badge b-aman">AMAN</span>` : `<span class="badge b-na">Tanpa target</span>`; }

/* ---------- login / auth ---------- */
export function showLogin() { 
  // Auth disabled - show app directly
  $("boot").hidden = true; 
  $("login").hidden = true; 
  $("app").hidden = false; 
}
export async function checkAuth() {
  return true; // Auth disabled
}
export function attachAuthListeners() {
  // Auth disabled - no listeners needed
}

/* ---------- load data ---------- */
export async function loadAll() {
  const [a, b] = await Promise.all([api("/items"), api("/mutations?limit=300")]);
  S.items = a.items; S.log = b.mutations;
}

/* ---------- header injection ---------- */
export function injectHeader(activePath) {
  const slot = $("header-slot");
  if (!slot) return;
  const headerTmpl = document.getElementById("layout-header");
  if (headerTmpl) {
    slot.innerHTML = headerTmpl.innerHTML;
    slot.querySelectorAll(".tab").forEach(el => {
      if (el.getAttribute("href") === activePath) el.classList.add("active");
    });
  }
  // Re-attach logout
  const btn = $("btnLogout");
  if (btn) btn.onclick = async () => { try { await api("/auth/logout", { method: "POST" }); } catch {} showLogin(); };
}

/* ---------- init app ---------- */
export async function initApp() {
  await loadAll();
  // Inject modal/toast templates
  const modalTmpl = document.getElementById("layout-modal-toast");
  if (modalTmpl && !$("modal")) {
    const div = document.createElement("div");
    div.innerHTML = modalTmpl.innerHTML;
    document.body.appendChild(div);
  }
  // Attach auth listeners (login form, logout)
  attachAuthListeners();
  // Escape closes modal
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}

/* ---------- dashboard ---------- */
export function renderDashboard() {
  const it = S.items, ord = it.filter((i) => statusOf(i) === "ORDER"), tot = it.reduce((a, i) => a + i.stok, 0);
  const noPR = ord.filter((i) => !i.no_pr && !i.no_po).length, pr = ord.filter((i) => i.no_pr && !i.no_po).length, po = ord.filter((i) => i.no_po).length;
  const K = [["Total jenis sparepart", fmt(it.length), `${cats().length} kategori`, "var(--fg)"], ["⚠️ Berstatus ORDER", fmt(ord.length), `${it.length ? Math.round((ord.length / it.length) * 100) : 0}% dari seluruh jenis`, "var(--bad)"], ["Total stok keseluruhan", fmt(tot), "jumlah unit fisik, semua satuan", "var(--accent)"], ["ORDER belum ada PR", fmt(noPR), "perlu segera dibuatkan PR", "var(--warn)"]];
  $("kpis").innerHTML = K.map((k) => `<div class="card p-4 min-w-0"><div class="kpi-label">${k[0]}</div><div class="kpi-val num mt-1" style="color:${k[3]}">${k[1]}</div><div class="text-xs mt-1" style="color:var(--muted)">${k[2]}</div></div>`).join("");
  const rows = cats().map((c) => { const l = it.filter((i) => i.kategori === c); return { c, n: l.length, o: l.filter((i) => statusOf(i) === "ORDER").length }; }).sort((a, b) => b.o - a.o || b.n - a.n);
  const mx = Math.max(1, ...rows.map((r) => r.n));
  $("catChart").innerHTML = rows.map((r) => `<div><div class="flex justify-between gap-3 text-sm mb-1"><span class="truncate font-medium">${esc(r.c)}</span><span class="num shrink-0" style="color:var(--muted)"><b style="color:var(--bad)">${r.o}</b> ORDER dari ${r.n}</span></div><div class="bar" style="width:${(r.n / mx) * 100}%;min-width:12px"><span class="seg-o" style="width:${r.n ? (r.o / r.n) * 100 : 0}%"></span><span class="seg-a" style="width:${r.n ? ((r.n - r.o) / r.n) * 100 : 0}%"></span></div></div>`).join("");
  const p = it.length ? (ord.length / it.length) * 100 : 0;
  $("donutBox").innerHTML = `<div class="donut" style="background:conic-gradient(var(--bad) 0 ${p}%,var(--ok) ${p}% 100%)" role="img" aria-label="${ord.length} ORDER dari ${it.length} jenis"><b class="num">${Math.round(p)}%<small>ORDER</small></b></div>
  <div class="flex flex-col gap-1.5 text-sm"><div><i class="dot seg-o"></i>ORDER <b class="num">${ord.length}</b></div><div><i class="dot seg-a"></i>AMAN <b class="num">${it.filter((i) => statusOf(i) === "AMAN").length}</b></div><div><i class="dot" style="background:var(--line)"></i>Tanpa target <b class="num">${it.filter((i) => statusOf(i) === "NA").length}</b></div></div>`;
  $("procBox").innerHTML = `<div class="kpi-label mb-2">Posisi dokumen item ORDER</div><div class="flex flex-wrap gap-2"><span class="badge b-order">Belum ada PR: ${noPR}</span><span class="badge b-pr">Sudah PR: ${pr}</span><span class="badge b-po">Sudah PO: ${po}</span></div>`;
  const u = [...ord].sort((a, b) => ratio(a) - ratio(b) || b.kebutuhan - b.stok - (a.kebutuhan - a.stok)).slice(0, 10);
  $("urgent").innerHTML = u.length ? u.map((i) => { const pc = Math.min(100, ratio(i) * 100); return `<tr><td><div class="font-medium">${esc(i.tipe)}</div></td><td>${esc(i.kategori)}</td><td class="r mono">${fmt(i.stok)} / ${fmt(minOf(i))}</td><td><div class="meter"><i style="width:${pc}%"></i></div><div class="text-xs mt-1" style="color:var(--muted)">${i.stok <= 0 ? "Stok habis" : Math.round(pc) + "% dari minimal"}</div></td><td class="r mono"><b>${fmt(Math.max(0, i.kebutuhan - i.stok))}</b> ${esc(i.satuan)}</td><td>${docBadge(i)}<div class="mono text-xs mt-1" style="color:var(--muted)">${esc(i.no_pr)}</div></td></tr>`; }).join("") : `<tr><td colspan="6" style="color:var(--muted)">Tidak ada item berstatus ORDER.</td></tr>`;
}

/* ---------- data table ---------- */
const COLS = [["kategori", "Kategori"], ["tipe", "Tipe / Nama Sparepart"], ["kebutuhan", "Kebutuhan Stok", "r"], ["min", "Stok Minimal", "r"], ["stok", "Stok Sekarang", "r"], ["no_ppb", "No. PPB"], ["no_pr", "No. PR"], ["no_po", "No. PO"], ["balance", "Balance", "r"], ["status", "Status"], ["remark", "Remark / Keterangan"], ["act", "Aksi"]];

function sortVal(i, k) { return k === "min" ? i.stok_min : k === "status" ? { ORDER: 0, AMAN: 1, NA: 2 }[i.status] * 1000 + ratio(i) : i[k]; }
function filtered() { const q = S.q.trim().toLowerCase(); return S.items.filter((i) => (!S.k || i.kategori === S.k) && (!S.s || statusOf(i) === S.s) && (!q || [i.tipe, i.kategori, i.no_pr, i.no_po, i.no_ppb].some((v) => (v || "").toLowerCase().includes(q)))); }

export function renderDataTable() {
  const thead = $("thead");
  if (thead) thead.innerHTML = COLS.map((c) => `<th class="${c[2] || ""}" data-k="${c[0]}" ${c[0] === "act" ? 'style="cursor:default"' : ""}>${c[1]}<span class="sortmark"></span></th>`).join("");

  const f = filtered(), { key, dir } = S.sort;
  f.sort((a, b) => { const x = sortVal(a, key), y = sortVal(b, key); const r = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "id", { numeric: true }); return r * dir; });
  const pages = Math.max(1, Math.ceil(f.length / S.per)); S.page = Math.min(S.page, pages);
  const rows = f.slice((S.page - 1) * S.per, S.page * S.per);

  const countEl = $("count"), pginfo = $("pginfo"), prev = $("prev"), next = $("next");
  if (countEl) countEl.textContent = `${f.length} dari ${S.items.length} jenis sparepart`;
  if (pginfo) pginfo.textContent = `Halaman ${S.page} dari ${pages}`;
  if (prev) prev.disabled = S.page <= 1;
  if (next) next.disabled = S.page >= pages;

  document.querySelectorAll("#thead th").forEach((th) => { const mark = th.querySelector(".sortmark"); if (mark) mark.textContent = th.dataset.k === key ? (dir > 0 ? " ▲" : " ▼") : ""; });

  const tbody = $("tbody");
  if (tbody) tbody.innerHTML = rows.length ? rows.map((i) => { const st = statusOf(i); return `<tr class="${st === "ORDER" ? "row-order" : ""}"><td class="whitespace-nowrap">${esc(i.kategori)}</td><td style="min-width:220px"><div class="font-medium">${esc(i.tipe)}${i.lampiran ? ` <span class="text-xs" style="color:var(--muted)" title="${i.lampiran} lampiran">📎${i.lampiran}</span>` : ""}</div></td><td class="r mono">${fmt(i.kebutuhan)} <span class="text-xs" style="color:var(--muted)">${esc(i.satuan)}</span></td><td class="r mono">${fmt(minOf(i))}</td><td class="r mono stk"><b>${fmt(i.stok)}</b></td><td class="mono text-xs">${esc(i.no_ppb) || "-"}</td><td class="mono text-xs">${esc(i.no_pr) || "-"}</td><td class="mono text-xs">${esc(i.no_po) || "-"}</td><td class="r mono">${fmt(i.balance)}</td><td>${stBadge(st)}</td><td style="min-width:200px" class="text-xs">${esc(i.remark) || "-"}</td><td class="whitespace-nowrap"><button class="btn sm" data-id="${esc(i.id)}">Edit</button></td></tr>`; }).join("") : `<tr><td colspan="12" style="color:var(--muted);padding:24px">Tidak ada sparepart yang cocok dengan filter.</td></tr>`;

  // Event listeners (re-attach after render)
  if (tbody) tbody.onclick = (e) => { const b = e.target.closest("button[data-id]"); if (b) editModal(b.dataset.id); };
  const qEl = $("q"); if (qEl) qEl.oninput = (e) => { S.q = e.target.value; S.page = 1; renderDataTable(); };
  const fkEl = $("fk"); if (fkEl) fkEl.onchange = (e) => { S.k = e.target.value; S.page = 1; renderDataTable(); };
  const fsEl = $("fs"); if (fsEl) fsEl.onchange = (e) => { S.s = e.target.value; S.page = 1; renderDataTable(); };
  if (prev) prev.onclick = () => { S.page--; renderDataTable(); };
  if (next) next.onclick = () => { S.page++; renderDataTable(); };
  fillCats();
}

/* ---------- modal: edit / tambah ---------- */
export function openModal(html) { $("modal").innerHTML = `<div class="modal-bg" id="mbg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; $("mbg").onclick = (e) => { if (e.target.id === "mbg") closeModal(); }; const f = $("modal").querySelector("input,select"); f && f.focus(); }
export function closeModal() { $("modal").innerHTML = ""; }
const minPreview = (v) => Math.ceil(Math.round((parseFloat(v) || 0) * 0.4 * 1000) / 1000);

function formFields(i) {
  return `<div class="grid gap-3 sm:grid-cols-2">
  <div class="sm:col-span-2"><label class="lb" for="ek">Kategori</label><input id="ek" class="field" list="catlist" value="${esc(i.kategori)}"><datalist id="catlist">${cats().map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>
  <div class="sm:col-span-2"><label class="lb" for="et">Tipe / Nama Sparepart</label><input id="et" class="field" value="${esc(i.tipe)}"></div>
  <div><label class="lb" for="ekb">Kebutuhan Stok</label><input id="ekb" class="field mono" type="number" min="0" step="any" value="${i.kebutuhan}"><div class="text-xs mt-1" style="color:var(--muted)">Stok minimal otomatis <b id="minprev" class="mono">${fmt(minPreview(i.kebutuhan))}</b> (40%, dibulatkan ke atas)</div></div>
  <div><label class="lb" for="esat">Satuan</label><input id="esat" class="field" value="${esc(i.satuan)}"></div>
  <div><label class="lb" for="eppb">No. PPB</label><input id="eppb" class="field mono" value="${esc(i.no_ppb)}"></div>
  <div><label class="lb" for="epr">No. PR</label><input id="epr" class="field mono" value="${esc(i.no_pr)}"></div>
  <div><label class="lb" for="epo">No. PO</label><input id="epo" class="field mono" value="${esc(i.no_po)}"></div>
  <div><label class="lb" for="ebal">Balance</label><input id="ebal" class="field mono" type="number" step="any" value="${i.balance}"></div>
  <div class="sm:col-span-2"><label class="lb" for="erm">Remark / Keterangan</label><textarea id="erm" class="field" rows="2">${esc(i.remark)}</textarea></div></div>`;
}
const bindMin = () => { const ekb = $("ekb"); if (ekb) ekb.oninput = () => { const mp = $("minprev"); if (mp) mp.textContent = fmt(minPreview(ekb.value)); }; };
function readForm() {
  const tipe = $("et").value.trim(), kategori = $("ek").value.trim();
  if (!tipe || !kategori) throw new Error("Kategori dan nama sparepart wajib diisi");
  return { kategori, tipe, kebutuhan: parseFloat($("ekb").value) || 0, satuan: $("esat").value.trim() || "Pcs", no_ppb: $("eppb").value.trim(), no_pr: $("epr").value.trim(), no_po: $("epo").value.trim(), balance: parseFloat($("ebal").value) || 0, remark: $("erm").value.trim() };
}
const upsertLocal = (item) => { const n = S.items.findIndex((x) => x.id === item.id); n >= 0 ? (S.items[n] = item) : S.items.push(item); };

function fileRow(f) {
  const img = f.type.startsWith("image/") ? `<img class="thumb" src="${fileUrl(f.key)}" alt="">` : `<div class="thumb flex items-center justify-center text-xs">PDF</div>`;
  return `<div class="file-row">${img}<a class="lnk text-sm grow min-w-0" href="${fileUrl(f.key)}" target="_blank" rel="noopener">${esc(f.name)}</a><button type="button" class="btn sm danger" data-del="${esc(f.key)}">Hapus</button></div>`;
}
async function loadFiles(id) {
  const box = $("filelist"); if (!box) return;
  const { files } = await api(`/files?entity_type=item&entity_id=${encodeURIComponent(id)}`);
  box.innerHTML = files.length ? files.map(fileRow).join("") : `<div class="text-xs" style="color:var(--muted)">Belum ada lampiran.</div>`;
  box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = guard(async () => { await api(`/files/${b.dataset.del.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" }); await loadFiles(id); await refreshItems(); })));
}
async function refreshItems() { S.items = (await api("/items")).items; }

export function editModal(id) {
  const i = S.items.find((x) => x.id === id);
  if (!i) return;
  openModal(`<h3 class="font-bold text-lg mb-1">Edit Sparepart</h3><div class="text-sm mb-4" style="color:var(--muted)">Isi nomor dokumen, balance, dan remark. Stok diubah lewat menu Mutasi.</div>${formFields(i)}
  <div class="mt-4 pt-3" style="border-top:1px solid var(--line)"><div class="kpi-label mb-1">Lampiran (foto sparepart, dokumen PPB / PR / PO)</div><div id="filelist"></div>
    <div class="flex gap-2 mt-2"><input id="efile" class="field" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><button type="button" class="btn" id="eup">Unggah</button></div></div>
  <div class="flex flex-wrap justify-between gap-2 mt-5"><button class="btn danger" id="mdel">Hapus</button><div class="flex gap-2"><button class="btn" id="mc">Batal</button><button class="btn pri" id="ms">Simpan</button></div></div>`);
  bindMin(); const mc = $("mc"); if (mc) mc.onclick = closeModal;
  guard(() => loadFiles(id))();
  const eup = $("eup"); if (eup) eup.onclick = guard(async () => {
    const f = $("efile").files[0]; if (!f) throw new Error("Pilih file dulu");
    const form = new FormData(); form.set("entity_type", "item"); form.set("entity_id", id); form.set("file", f);
    eup.disabled = true; try { await api("/files", { method: "POST", form }); } finally { eup.disabled = false; }
    $("efile").value = ""; await loadFiles(id); await refreshItems(); toast("Lampiran diunggah");
  });
  const ms = $("ms"); if (ms) ms.onclick = guard(async () => { const r = await api(`/items/${encodeURIComponent(id)}`, { method: "PUT", body: readForm() }); upsertLocal(r.item); closeModal(); renderDataTable(); toast("Perubahan tersimpan"); });
  const mdel = $("mdel"); if (mdel) mdel.onclick = () => { mdel.textContent = "Klik lagi untuk menghapus"; mdel.onclick = guard(async () => { await api(`/items/${encodeURIComponent(id)}`, { method: "DELETE" }); S.items = S.items.filter((x) => x.id !== id); closeModal(); renderDataTable(); toast("Sparepart dihapus"); }); };
}
export function addItemModal() {
  const i = { kategori: S.k || "", tipe: "", kebutuhan: 0, satuan: "Pcs", no_ppb: "", no_pr: "", no_po: "", balance: 0, remark: "" };
  openModal(`<h3 class="font-bold text-lg mb-4">Tambah Sparepart</h3>${formFields(i)}<div class="grid mt-3"><div><label class="lb" for="est">Stok awal</label><input id="est" class="field mono" type="number" min="0" step="any" value="0"></div></div>
  <div class="flex justify-end gap-2 mt-5"><button class="btn" id="mc">Batal</button><button class="btn pri" id="ms">Tambah</button></div>`);
  bindMin(); const mc = $("mc"); if (mc) mc.onclick = closeModal;
  const ms = $("ms"); if (ms) ms.onclick = guard(async () => { const r = await api("/items", { method: "POST", body: { ...readForm(), stok: parseFloat($("est").value) || 0 } }); upsertLocal(r.item); closeModal(); renderDataTable(); toast("Sparepart ditambahkan"); });
}

/* ---------- mutasi ---------- */
function mutTypes() { const k = $("mk").value, f = $("mfind").value.trim().toLowerCase(); return S.items.filter((i) => i.kategori === k && (!f || i.tipe.toLowerCase().includes(f))); }
function fillMutTypes() { const l = mutTypes(), cur = $("mt").value; $("mt").innerHTML = l.length ? l.map((i) => `<option value="${esc(i.id)}" ${i.id === cur ? "selected" : ""}>${esc(i.tipe)}</option>`).join("") : `<option value="">Tidak ada tipe yang cocok</option>`; mutInfo(); }
function mutInfo() { const i = S.items.find((x) => x.id === $("mt").value); const minfo = $("minfo"); if (minfo) minfo.innerHTML = i ? `Stok sekarang <b class="mono">${fmt(i.stok)} ${esc(i.satuan)}</b> · minimal <b class="mono">${fmt(minOf(i))}</b> · ${stBadge(statusOf(i))}` : ""; }
function fillMut() { const cur = $("mk").value, cs = cats().sort(); const mk = $("mk"); if (mk) mk.innerHTML = cs.map((c) => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join(""); const md = $("md"); if (md && !md.value) md.value = today(); fillMutTypes(); }

export function renderMutasi() {
  fillMut();
  renderLog();

  const mkEl = $("mk"); if (mkEl) mkEl.onchange = () => { $("mfind").value = ""; fillMutTypes(); };
  const mfindEl = $("mfind"); if (mfindEl) mfindEl.oninput = fillMutTypes;
  const mtEl = $("mt"); if (mtEl) mtEl.onchange = mutInfo;

  const mform = $("mform"); if (mform) mform.onsubmit = async (e) => {
    e.preventDefault(); const er = $("merr"); if (er) er.textContent = "";
    const itemId = $("mt").value, jenis = document.querySelector("input[name=mj]:checked")?.value, q = parseFloat($("mq").value), pic = $("mpic").value.trim(), file = $("mfile").files[0];
    if (!itemId) { if (er) er.textContent = "Pilih kategori dan tipe sparepart."; return; }
    if (!(q > 0)) { if (er) er.textContent = "Isi jumlah lebih dari 0."; return; }
    if (!pic) { if (er) er.textContent = "Isi nama PIC."; return; }
    const btn = e.submitter; btn && (btn.disabled = true);
    try {
      const r = await api("/mutations", { method: "POST", body: { item_id: itemId, jenis, jumlah: q, tanggal: $("md").value, pic, catatan: $("mn").value.trim() } });
      upsertLocal(r.item); S.log.unshift(r.mutation);
      if (file) {
        try { const form = new FormData(); form.set("entity_type", "mutation"); form.set("entity_id", String(r.mutation.id)); form.set("file", file); const up = await api("/files", { method: "POST", form }); r.mutation.files = [{ key: up.file.key, name: up.file.name, type: up.file.type }]; }
        catch (fe) { toast("Mutasi tersimpan, tetapi bukti gagal diunggah: " + fe.message); }
      }
      $("mq").value = ""; $("mn").value = ""; $("mfile").value = ""; mutInfo(); renderLog();
      toast(`${jenis} ${fmt(q)} ${r.item.satuan} tersimpan. Stok sekarang ${fmt(r.item.stok)}`);
    } catch (err) { if (err.status !== 401 && er) er.textContent = err.message; }
    finally { btn && (btn.disabled = false); }
  };
}
function renderLog() {
  const logbody = $("logbody");
  if (logbody) logbody.innerHTML = S.log.length ? S.log.map((l) => { const inn = l.jenis === "IN"; return `<tr><td class="mono whitespace-nowrap">${esc(l.tanggal)}</td><td><span class="badge ${inn ? "b-aman" : "b-pr"}">${inn ? "IN" : "OUT"}</span></td><td class="whitespace-nowrap">${esc(l.kategori)}</td><td style="min-width:200px">${esc(l.tipe)}</td><td class="r mono">${inn ? "+" : "-"}${fmt(l.jumlah)} ${esc(l.satuan)}</td><td class="r mono">${fmt(l.stok_akhir)}</td><td>${esc(l.pic) || "-"}</td><td class="text-xs">${esc(l.catatan) || "-"}</td><td class="text-xs">${(l.files || []).map((f) => `<a class="lnk" href="${fileUrl(f.key)}" target="_blank" rel="noopener">${esc(f.name)}</a>`).join("<br>") || "-"}</td></tr>`; }).join("") : `<tr><td colspan="9" style="color:var(--muted);padding:24px">Belum ada mutasi. Isi formulir di sebelah kiri untuk mencatat IN atau OUT.</td></tr>`;
}

/* ---------- category fill ---------- */
function fillCats() {
  const fk = $("fk"), mk = $("mk");
  const catOptions = `<option value="">Semua kategori</option>` + cats().sort().map((c) => `<option>${esc(c)}</option>`).join("");
  if (fk) { const cur = fk.value; fk.innerHTML = catOptions; if (cur) fk.value = cur; }
  if (mk) { const cur = mk.value; mk.innerHTML = cats().sort().map((c) => `<option ${c === cur ? "selected" : ""}>${esc(c)}</option>`).join(""); }
}

/* ---------- btnAdd for data page ---------- */
const btnAdd = $("btnAdd");
if (btnAdd) btnAdd.onclick = () => addItemModal();