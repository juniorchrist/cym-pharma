-- =====================================================================
-- CYM PHARMA — MIGRATION 002 : MODULE INVENTAIRE & STOCKS POSTGRESQL
-- supabase/migrations/20261024000002_inventory_module.sql
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. ARTICLES EN STOCK
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code             TEXT NOT NULL UNIQUE,
  designation      TEXT NOT NULL,
  designation_norm TEXT NOT NULL,
  unit_label       TEXT DEFAULT 'Unité',
  product_id       TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  min_stock        INTEGER DEFAULT 5,
  is_tracked       BOOLEAN NOT NULL DEFAULT TRUE,
  qty_on_hand      INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_code ON public.inventory_items(code);
CREATE INDEX IF NOT EXISTS idx_inv_product_id ON public.inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_tracked ON public.inventory_items(is_tracked);
CREATE INDEX IF NOT EXISTS idx_inv_active ON public.inventory_items(is_active);

-- ─────────────────────────────────────────────────────────────────────
-- 2. PÉRIODES D'INVENTAIRE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_periods (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label       TEXT NOT NULL,
  year        SMALLINT NOT NULL,
  month       SMALLINT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'counting')),
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ,
  closed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_period_status ON public.inventory_periods(status);
CREATE INDEX IF NOT EXISTS idx_period_year_month ON public.inventory_periods(year, month);

-- ─────────────────────────────────────────────────────────────────────
-- 3. MOUVEMENTS DE STOCK
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id     TEXT NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('entry', 'exit', 'adjustment', 'count_correction', 'sale_online', 'loss', 'expiry', 'return')),
  qty         INTEGER NOT NULL,
  qty_before  INTEGER NOT NULL DEFAULT 0,
  qty_after   INTEGER NOT NULL DEFAULT 0,
  ref_doc     TEXT,
  note        TEXT,
  period_id   TEXT REFERENCES public.inventory_periods(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sm_item ON public.stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_sm_type ON public.stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_sm_period ON public.stock_movements(period_id);
CREATE INDEX IF NOT EXISTS idx_sm_date ON public.stock_movements(created_at);

-- ─────────────────────────────────────────────────────────────────────
-- 4. COMPTAGES PHYSIQUES PAR PÉRIODE D'INVENTAIRE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  period_id     TEXT NOT NULL REFERENCES public.inventory_periods(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  expected_qty  INTEGER NOT NULL DEFAULT 0,
  counted_qty   INTEGER,
  discrepancy   INTEGER,
  counted_at    TIMESTAMPTZ,
  counted_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_period_item UNIQUE (period_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_ic_period ON public.inventory_counts(period_id);
CREATE INDEX IF NOT EXISTS idx_ic_item ON public.inventory_counts(item_id);
