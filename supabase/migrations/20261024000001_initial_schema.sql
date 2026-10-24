-- =====================================================================
-- CYM PHARMA — MIGRATION 001 : SCHÉMA INITIAL POSTGRESQL (SUPABASE)
-- supabase/migrations/20261024000001_initial_schema.sql
-- =====================================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────
-- 1. PROFILS UTILISATEURS (liés à auth.users de Supabase)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL UNIQUE,
  role                  TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  name                  TEXT,
  first_name            TEXT,
  last_name             TEXT,
  phone                 TEXT,
  establishment_name    TEXT,
  establishment_type    TEXT,
  commune               TEXT,
  address               TEXT,
  org                   TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
  last_order_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Trigger auto-création de profil à l'inscription auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.profiles.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────
-- 2. CATÉGORIES DE PRODUITS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id          SERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(is_active);

-- ─────────────────────────────────────────────────────────────────────
-- 3. PRODUITS DU CATALOGUE
-- Note de confidentialité : ref_price et price sont strictement réservés à l'admin
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reference         TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  category          TEXT,
  category_main     TEXT,
  unit              TEXT DEFAULT 'Unité',
  conditionnement   TEXT,
  ref_price         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  price             NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  currency          TEXT NOT NULL DEFAULT 'FCFA',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_published      BOOLEAN NOT NULL DEFAULT TRUE,
  image_url         TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_ref ON public.products(reference);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_main);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active, is_published);

-- ─────────────────────────────────────────────────────────────────────
-- 4. COMMANDES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                   TEXT PRIMARY KEY DEFAULT ('CMD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0')),
  order_number         TEXT NOT NULL UNIQUE,
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  establishment_name   TEXT,
  shipping_address     TEXT,
  shipping_city        TEXT,
  shipping_notes       TEXT,
  status               TEXT NOT NULL DEFAULT 'En attente de devis',
  notes                TEXT,
  subtotal             NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  total                NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  currency             TEXT NOT NULL DEFAULT 'FCFA',
  invoice_number       TEXT,
  invoice_date         TIMESTAMPTZ,
  priced_at            TIMESTAMPTZ,
  shipped_at           TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancel_reason        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders(order_number);

-- ─────────────────────────────────────────────────────────────────────
-- 5. LIGNES DE COMMANDE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id            BIGSERIAL PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id    TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  reference     TEXT,
  name          TEXT NOT NULL,
  unit          TEXT DEFAULT 'Unité',
  conditionnement TEXT,
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  line_total    NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  currency      TEXT NOT NULL DEFAULT 'FCFA',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON public.order_items(product_id);

-- ─────────────────────────────────────────────────────────────────────
-- 6. HISTORIQUE DES STATUTS DE COMMANDE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id          BIGSERIAL PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  note        TEXT,
  changed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_osh_order ON public.order_status_history(order_id);

-- ─────────────────────────────────────────────────────────────────────
-- 7. BONS DE LIVRAISON
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id            TEXT PRIMARY KEY DEFAULT ('BL-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0')),
  order_id      TEXT NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  bl_number     TEXT NOT NULL UNIQUE,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at  TIMESTAMPTZ,
  notes         TEXT
);

-- ─────────────────────────────────────────────────────────────────────
-- 8. LOGS DE RELANCE CLIENT
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.relance_logs (
  id                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name              TEXT,
  establishment_name     TEXT,
  recipient_email        TEXT,
  recipient_phone        TEXT,
  channel                TEXT DEFAULT 'email',
  subject                TEXT,
  message                TEXT,
  trigger_reason         TEXT,
  days_since_last_order  INTEGER,
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('sent','failed','pending')),
  sent_at                TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relance_user ON public.relance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_relance_status ON public.relance_logs(status);

-- ─────────────────────────────────────────────────────────────────────
-- 9. MESSAGES DE CONTACT
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  org         TEXT,
  subject     TEXT,
  message     TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_email ON public.contact_messages(email);
