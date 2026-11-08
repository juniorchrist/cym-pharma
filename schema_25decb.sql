-- =============================================================================
-- CYM PHARMA — MIGRATION SCHEMA INVENTAIRE & STOCKS (schema_25decb.sql)
-- Exécuter dans l'éditeur SQL Supabase pour aligner les tables d'inventaire
-- RLS STRICT : Toutes les écritures et lectures passent par le serveur Node.js (service role)
-- Aucune politique publique anonyme n'est créée afin de protéger le secret commercial.
-- =============================================================================

-- 1. MODULE INVENTAIRE — Articles (inventory_items)
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id               TEXT        NOT NULL PRIMARY KEY,
  code             TEXT        NOT NULL UNIQUE,
  designation      TEXT        NOT NULL,
  designation_norm TEXT        NOT NULL,
  unit_label       TEXT        DEFAULT 'Unité',
  product_id       TEXT,
  min_stock        INT         DEFAULT 5,
  is_tracked       BOOLEAN     NOT NULL DEFAULT TRUE,
  qty_on_hand      INT         NOT NULL DEFAULT 0,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_code       ON public.inventory_items (code);
CREATE INDEX IF NOT EXISTS idx_inv_norm       ON public.inventory_items (designation_norm);
CREATE INDEX IF NOT EXISTS idx_inv_tracked    ON public.inventory_items (is_tracked);
CREATE INDEX IF NOT EXISTS idx_inv_active     ON public.inventory_items (is_active);

-- 2. MODULE INVENTAIRE — Périodes de comptage (inventory_periods)
CREATE TABLE IF NOT EXISTS public.inventory_periods (
  id         TEXT        NOT NULL PRIMARY KEY,
  label      TEXT,
  year       INT,
  month      INT,
  year_month TEXT        UNIQUE,
  status     TEXT        NOT NULL DEFAULT 'counting' CHECK (status IN ('open','counting','closed')),
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at  TIMESTAMPTZ,
  closed_by  UUID,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compléter les colonnes si la table existait déjà
ALTER TABLE public.inventory_periods ADD COLUMN IF NOT EXISTS year_month TEXT;
ALTER TABLE public.inventory_periods ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.inventory_periods ADD COLUMN IF NOT EXISTS year INT;
ALTER TABLE public.inventory_periods ADD COLUMN IF NOT EXISTS month INT;
ALTER TABLE public.inventory_periods ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.inventory_periods ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_per_year_month ON public.inventory_periods (year_month);
CREATE INDEX IF NOT EXISTS idx_per_status     ON public.inventory_periods (status);

-- 3. MODULE INVENTAIRE — Mouvements de stock (stock_movements)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            TEXT        NOT NULL PRIMARY KEY,
  item_id       TEXT        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL,
  qty           INT         NOT NULL DEFAULT 0,
  quantity      INT         DEFAULT 0,
  qty_before    INT,
  qty_after     INT,
  movement_date DATE        DEFAULT CURRENT_DATE,
  ref_doc       TEXT,
  reason        TEXT,
  note          TEXT,
  order_id      TEXT,
  order_item_id TEXT,
  period_id     TEXT        REFERENCES public.inventory_periods(id) ON DELETE SET NULL,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compléter les colonnes si la table existait déjà
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS qty INT DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS qty_before INT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS qty_after INT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS movement_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS ref_doc TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS order_id TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS order_item_id TEXT;

-- Mettre à jour la contrainte de type pour supporter tous les mouvements B2B CYM Pharma
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check 
  CHECK (type IN ('opening', 'purchase', 'sale_shop', 'sale_online', 'return', 'loss', 'adjustment', 'count_correction'));

CREATE INDEX IF NOT EXISTS idx_mvt_item_id ON public.stock_movements (item_id);
CREATE INDEX IF NOT EXISTS idx_mvt_type    ON public.stock_movements (type);
CREATE INDEX IF NOT EXISTS idx_mvt_period  ON public.stock_movements (period_id);

-- 4. MODULE INVENTAIRE — Comptages physiques (inventory_counts)
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id              TEXT        NOT NULL PRIMARY KEY,
  period_id       TEXT        NOT NULL REFERENCES public.inventory_periods(id) ON DELETE CASCADE,
  item_id         TEXT        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  expected_qty    INT         NOT NULL DEFAULT 0,
  theoretical_qty INT         NOT NULL DEFAULT 0,
  counted_qty     INT,
  discrepancy     INT,
  variance        INT,
  note            TEXT,
  counted_by      UUID,
  counted_at      TIMESTAMPTZ,
  status          TEXT        DEFAULT 'draft',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_id, item_id)
);

ALTER TABLE public.inventory_counts ADD COLUMN IF NOT EXISTS expected_qty INT DEFAULT 0;
ALTER TABLE public.inventory_counts ADD COLUMN IF NOT EXISTS theoretical_qty INT DEFAULT 0;
ALTER TABLE public.inventory_counts ADD COLUMN IF NOT EXISTS discrepancy INT;
ALTER TABLE public.inventory_counts ADD COLUMN IF NOT EXISTS variance INT;
ALTER TABLE public.inventory_counts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE public.inventory_counts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_cnt_period ON public.inventory_counts (period_id);
CREATE INDEX IF NOT EXISTS idx_cnt_item   ON public.inventory_counts (item_id);

-- 5. MODULE INVENTAIRE — Clôtures mensuelles (period_items)
CREATE TABLE IF NOT EXISTS public.period_items (
  id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  period_id   TEXT        NOT NULL REFERENCES public.inventory_periods(id) ON DELETE CASCADE,
  item_id     TEXT        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  opening_qty INT         NOT NULL DEFAULT 0,
  entries     INT         NOT NULL DEFAULT 0,
  exits       INT         NOT NULL DEFAULT 0,
  closing_qty INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_pi_period ON public.period_items (period_id);
CREATE INDEX IF NOT EXISTS idx_pi_item   ON public.period_items (item_id);

-- 6. SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- Active RLS sur toutes les tables de stock sans aucune règle anon publique.
-- Seul le backend server.js utilisant la clé SUPABASE_SERVICE_ROLE_KEY a accès complet.
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_items ENABLE ROW LEVEL SECURITY;

