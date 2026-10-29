-- =====================================================================
-- CYM PHARMA — MIGRATION PostgreSQL 001 : ÉVOLUTION INVENTAIRE
-- database/postgres/migrations/001_inventory_evolution.sql
-- =====================================================================
-- Objectif : faire évoluer une base Supabase EXISTANTE (< v2.0) vers
-- les structures canoniques v2.0 définies dans postgres/schema.sql.
-- Idempotente grâce aux instructions IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- =====================================================================

BEGIN;

-- 1. stock_movements : ajouter colonnes canoniques si absentes
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS quantity      INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS reason        TEXT,
  ADD COLUMN IF NOT EXISTS order_id      TEXT,
  ADD COLUMN IF NOT EXISTS order_item_id TEXT;

-- 2. inventory_periods : ajouter year_month si absent
ALTER TABLE public.inventory_periods
  ADD COLUMN IF NOT EXISTS year_month TEXT;

-- Créer l'index unique si absent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'inventory_periods'
      AND indexname  = 'uq_per_year_month'
  ) THEN
    ALTER TABLE public.inventory_periods ADD CONSTRAINT uq_per_year_month UNIQUE (year_month);
  END IF;
END;
$$;

-- 3. inventory_counts : harmoniser les noms de colonnes
ALTER TABLE public.inventory_counts
  ADD COLUMN IF NOT EXISTS counted_qty INT,
  ADD COLUMN IF NOT EXISTS variance    INT,
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name        = 'inventory_counts'
      AND constraint_name   = 'chk_cnt_status'
  ) THEN
    ALTER TABLE public.inventory_counts
      ADD CONSTRAINT chk_cnt_status CHECK (status IN ('draft','validated','skipped'));
  END IF;
END;
$$;

-- 4. period_items : ajouter colonnes canoniques si absentes
ALTER TABLE public.period_items
  ADD COLUMN IF NOT EXISTS opening_qty INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entries     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exits       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_qty INT NOT NULL DEFAULT 0;

-- 5. reminder_templates : ajouter warning_note si absent
ALTER TABLE public.reminder_templates
  ADD COLUMN IF NOT EXISTS warning_note TEXT;

-- 6. users : ajouter establishment_type si absent
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS establishment_type TEXT;

-- 7. S'assurer que status accepte 'pending'
DO $$
BEGIN
  -- Supprimer l'ancienne contrainte si elle ne contient pas 'pending'
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name        = 'users'
      AND constraint_name   = 'users_status_check'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
  END IF;
  -- Ajouter la contrainte avec 'pending'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name        = 'users'
      AND constraint_name   = 'chk_users_status'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT chk_users_status
        CHECK (status IN ('active','inactive','suspended','pending'));
  END IF;
END;
$$;

-- Enregistrement de la migration
INSERT INTO public.schema_migrations (version, name)
VALUES ('postgres-001', 'inventory_evolution')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
