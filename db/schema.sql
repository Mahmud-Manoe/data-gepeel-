-- Skema database Monitoring Sparepart Gudang (PostgreSQL / Neon)
-- Aman dijalankan berulang (IF NOT EXISTS).

CREATE SEQUENCE IF NOT EXISTS item_id_seq START 1000;

CREATE TABLE IF NOT EXISTS items (
  id          text PRIMARY KEY,
  kategori    text NOT NULL,
  tipe        text NOT NULL,
  kebutuhan   numeric(12,2) NOT NULL DEFAULT 0 CHECK (kebutuhan >= 0),
  -- Stok minimal otomatis 40% dari kebutuhan, dibulatkan ke atas
  stok_min    numeric(12,2) GENERATED ALWAYS AS (ceil(kebutuhan * 0.4)) STORED,
  stok        numeric(12,2) NOT NULL DEFAULT 0 CHECK (stok >= 0),
  satuan      text NOT NULL DEFAULT 'Pcs',
  no_ppb      text NOT NULL DEFAULT '',
  no_pr       text NOT NULL DEFAULT '',
  no_po       text NOT NULL DEFAULT '',
  balance     numeric(12,2) NOT NULL DEFAULT 0,
  remark      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_kategori_idx ON items (kategori);

CREATE TABLE IF NOT EXISTS mutations (
  id          bigserial PRIMARY KEY,
  -- Riwayat tetap ada walau sparepart dihapus
  item_id     text REFERENCES items(id) ON DELETE SET NULL,
  tanggal     date NOT NULL DEFAULT current_date,
  jenis       text NOT NULL CHECK (jenis IN ('IN','OUT')),
  jumlah      numeric(12,2) NOT NULL CHECK (jumlah > 0),
  stok_akhir  numeric(12,2) NOT NULL,
  pic         text NOT NULL,
  catatan     text NOT NULL DEFAULT '',
  -- salinan nama saat mutasi dicatat
  kategori    text NOT NULL,
  tipe        text NOT NULL,
  satuan      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mutations_item_idx ON mutations (item_id);
CREATE INDEX IF NOT EXISTS mutations_created_idx ON mutations (created_at DESC);

-- Metadata file di Cloudflare R2 (isi file ada di R2, kuncinya di r2_key)
CREATE TABLE IF NOT EXISTS attachments (
  id           bigserial PRIMARY KEY,
  entity_type  text NOT NULL CHECK (entity_type IN ('item','mutation')),
  entity_id    text NOT NULL,
  r2_key       text NOT NULL UNIQUE,
  filename     text NOT NULL,
  content_type text NOT NULL,
  size_bytes   integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments (entity_type, entity_id);
