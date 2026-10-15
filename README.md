# Monitoring Sparepart Gudang

Aplikasi monitoring stok sparepart PT. Gorontalo Panel Lestari.

| Bagian | Teknologi |
|---|---|
| Hosting + API | Cloudflare Pages + Pages Functions |
| Database | Neon (PostgreSQL) |
| Penyimpanan file (foto, dokumen PPB/PR/PO, bukti mutasi) | Cloudflare R2 |
| Tampilan | HTML + Tailwind CSS + JavaScript (tanpa framework) |

Semua data dibaca dari database. Tidak ada data yang tertanam di halaman web.

## Struktur folder

```
sparepart-monitoring/
├─ public/                  File yang disajikan ke browser
│  ├─ index.html            Kerangka halaman (login + 3 menu)
│  ├─ _headers              Header keamanan Cloudflare Pages
│  └─ assets/
│     ├─ app.js             Seluruh logika tampilan, memanggil /api/*
│     └─ app.css            Hasil build Tailwind (dibuat oleh npm run css, tidak masuk git)
├─ src/styles.css           Sumber CSS: Tailwind + palet warna GPL (terang/gelap)
├─ functions/               API (Cloudflare Pages Functions, rute = struktur folder)
│  ├─ _lib/                 db.js (Neon), auth.js (sesi), files.js, http.js
│  └─ api/
│     ├─ _middleware.js     Semua /api wajib login, kecuali /api/auth/*
│     ├─ auth/              login, logout, me
│     ├─ items/             GET/POST /api/items, PUT/DELETE /api/items/:id
│     ├─ mutations/         GET/POST /api/mutations  (IN / OUT, mengubah stok)
│     └─ files/             unggah/daftar ke R2, unduh/hapus /api/files/<key>
├─ db/schema.sql            Tabel: items, mutations, attachments
├─ data/seed-sparepart.json Data awal 374 sparepart (dari file Data All Spearpart Mill 03 Oktober 2026)
├─ scripts/                 migrate.mjs (buat tabel), seed.mjs (isi data awal)
├─ tests/                   Uji API otomatis (npm test)
├─ wrangler.toml            Konfigurasi Cloudflare (binding R2)
├─ .dev.vars.example        Contoh rahasia lokal -> salin jadi .dev.vars
├─ package.json
└─ tailwind.config.js
```

## Aturan bisnis (ada di database dan API, bukan hanya di tampilan)

- **Stok Minimal** = 40% x Kebutuhan Stok, dibulatkan ke atas. Kolom `stok_min` dihitung otomatis oleh PostgreSQL.
- **Status**: `⚠️ ORDER` bila Stok Sekarang <= Stok Minimal, selain itu `AMAN`. Kebutuhan 0 berarti `Tanpa target`.
- **Stok hanya berubah lewat Mutasi** (IN / OUT). Form Edit tidak bisa mengubah stok.
- Mutasi mengubah stok dan membuat riwayat dalam satu perintah SQL (atomik). OUT yang melebihi stok ditolak server (HTTP 409).
- Menghapus sparepart tidak menghapus riwayat mutasinya. File lampirannya ikut dihapus dari R2.

## 1. Menjalankan di komputer (VS Code)

Syarat: Node.js 20 atau lebih baru.

```bash
npm install
cp .dev.vars.example .dev.vars        # Windows: copy .dev.vars.example .dev.vars
```

### a. Buat database di Neon
1. Daftar di https://neon.tech, buat project (pilih region Singapore).
2. Klik **Connect**, pilih **Pooled connection**, salin connection string.
3. Tempel ke `DATABASE_URL` di `.dev.vars`. Isi juga `APP_PASSWORD` dan `SESSION_SECRET`.

### b. Buat tabel dan isi data awal
```bash
npm run db:migrate      # membuat tabel (aman dijalankan berulang)
npm run db:seed         # memasukkan 374 sparepart ke database
```
`db:seed` menolak jalan bila tabel `items` sudah berisi data, supaya data aktual tidak tertimpa. Untuk mengganti isi dengan data awal: `npm run db:seed:force` (riwayat mutasi tetap, tetapi terlepas dari sparepart yang dihapus).

### c. Buat bucket R2 (media storage)
```bash
npx wrangler login
npx wrangler r2 bucket create sparepart-media
```
Saat `npm run dev`, R2 disimulasikan secara lokal (file tersimpan di folder `.wrangler/`). Untuk memakai R2 asli saat lokal, jalankan `npx wrangler pages dev public --remote`.

### d. Jalankan
```bash
npm run dev             # build CSS lalu buka http://localhost:8788
```
Saat mengubah tampilan, jalankan `npm run css:watch` di terminal kedua.

Uji API otomatis (memakai PostgreSQL di dalam proses Node, tidak menyentuh Neon):
```bash
npm test
```

## 2. Deploy ke Cloudflare Pages

### Cara A: lewat GitHub (disarankan)
1. Push folder ini ke repository GitHub.
2. Cloudflare Dashboard > **Workers & Pages** > **Create** > **Pages** > **Connect to Git**, pilih repository.
3. Pengaturan build:
   - **Build command**: `npm run build`
   - **Build output directory**: `public`
4. Setelah project dibuat, buka **Settings > Variables and Secrets** dan tambahkan sebagai **Secret**:
   `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`.
5. Binding R2 dibaca dari `wrangler.toml` (`BUCKET` -> bucket `sparepart-media`). Bila nama bucket Bapak berbeda, ubah di `wrangler.toml`.
6. Deploy ulang. Aplikasi hidup di `https://<nama-project>.pages.dev`.

### Cara B: langsung dari komputer
```bash
npm run deploy                                                     # membuat project saat pertama kali
npx wrangler pages secret put DATABASE_URL --project-name sparepart-monitoring
npx wrangler pages secret put APP_PASSWORD --project-name sparepart-monitoring
npx wrangler pages secret put SESSION_SECRET --project-name sparepart-monitoring
npm run deploy                                                     # deploy ulang agar secret terbaca
```

## 3. Keamanan

- Seluruh `/api` memakai login satu password (`APP_PASSWORD`) dengan cookie sesi 12 jam (HttpOnly, SameSite=Strict, ditandatangani HMAC). Tanpa login, data tidak bisa dibaca maupun diubah.
- Untuk beberapa pengguna dengan akun masing-masing, pasang **Cloudflare Access** (Zero Trust) di depan domain Pages. Tidak perlu mengubah kode.
- Tambahkan aturan **rate limiting** di Cloudflare WAF untuk `/api/auth/login` agar password tidak bisa ditebak berulang.
- Jangan commit `.dev.vars`. File itu sudah ada di `.gitignore`.
- Lampiran dibatasi JPG, PNG, WebP, PDF, maksimal 8 MB. File disajikan lewat `/api/files/...` sehingga ikut dilindungi login (bucket R2 tidak dibuka ke publik).

## 4. Data aktual

`data/seed-sparepart.json` hanyalah data awal untuk mengisi database satu kali. Setelah itu, sumber data satu-satunya adalah database Neon: ubah lewat aplikasi (Edit, Tambah, Mutasi).

Format satu baris di `seed-sparepart.json`:

```json
{ "id": "SP-0001", "k": "Electrical", "t": "NYAF 1core x 0,75mm2", "keb": 200, "stok": 200,
  "sat": "Meter", "ppb": "", "pr": "", "po": "", "bal": 0, "rm": "" }
```
`k` = kategori, `t` = tipe, `keb` = kebutuhan stok, `stok` = stok sekarang, `sat` = satuan, `bal` = balance, `rm` = remark.

## 5. Ringkasan API

| Metode | Rute | Fungsi |
|---|---|---|
| POST | `/api/auth/login` | Masuk `{ "password": "..." }` |
| POST | `/api/auth/logout` | Keluar |
| GET | `/api/auth/me` | Cek sesi |
| GET | `/api/items` | Semua sparepart (stok_min dan status dihitung server) |
| POST | `/api/items` | Tambah sparepart (ID otomatis `SP-1000`, dst.) |
| PUT | `/api/items/:id` | Edit data dan dokumen (bukan stok) |
| DELETE | `/api/items/:id` | Hapus sparepart dan lampirannya |
| GET | `/api/mutations?limit=200` | Riwayat mutasi |
| POST | `/api/mutations` | Catat IN / OUT `{ item_id, jenis, jumlah, tanggal, pic, catatan }` |
| GET | `/api/files?entity_type=item&entity_id=SP-0001` | Daftar lampiran |
| POST | `/api/files` | Unggah (multipart: entity_type, entity_id, file) |
| GET / DELETE | `/api/files/<key>` | Tampilkan / hapus file |

## Catatan data awal

- Kebutuhan Stok berasal dari kolom Max Stok sumber. Bila kosong, dihitung dari Min Stok / 0,4. Karena aturan 40% dibulatkan ke atas, jumlah item ORDER (255) bisa berbeda dari file Excel (236).
- No. PPB masih kosong. No. PR dan No. PO diambil dari sumber, Balance dari Qty Order sumber.
