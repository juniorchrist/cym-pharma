-- =====================================================================
-- CYM PHARMA -- SUPABASE : SCHEMA COMPLET (setup unique)
-- supabase/full_schema_setup.sql
-- =====================================================================
-- Généré automatiquement depuis les migrations supabase/migrations/
-- Ce fichier = unique fichier SQL à coller dans le SQL Editor Supabase
-- pour initialiser l'intégralité de la base de données de production.
-- Comprend : Tables, Triggers auth, Vues publiques, Politiques RLS, Module Inventaire et Relances.
-- Génération : 2026-10-29T19:57:33.689Z
-- =====================================================================


-- =====================================================================
-- MIGRATION : 20261024000001_initial_schema.sql
-- =====================================================================

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
-- RÈGLE DE SÉCURITÉ : Le rôle est STRICTEMENT 'client' par défaut.
-- Aucune métadonnée client ne peut attribuer les privilèges 'admin'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, first_name, last_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    'client',
    'active'
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

-- Fonction de vérification du rôle administrateur
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sécurité RLS/Trigger : Empêcher toute tentative d'auto-attribution du rôle admin
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Opération interdite : la modification du rôle exige les privilèges administrateur.';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Opération interdite : la modification du statut exige les privilèges administrateur.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

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

-- Alignement de type automatique si les tables existaient préalablement en smallint
DO $$
DECLARE
  r RECORD;
BEGIN
  -- 1. Supprimer les anciennes contraintes CHECK qui comparent is_active ou is_published à un entier (0, 1)
  FOR r IN (
    SELECT c.conname, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public' 
      AND t.relname IN ('categories', 'products', 'inventory_items')
      AND c.contype = 'c'
      AND (pg_get_constraintdef(c.oid) LIKE '%is_active%' OR pg_get_constraintdef(c.oid) LIKE '%is_published%')
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.relname, r.conname);
  END LOOP;

  -- 2. Conversion categories.is_active -> BOOLEAN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'is_active' AND data_type <> 'boolean'
  ) THEN
    EXECUTE 'ALTER TABLE public.categories ALTER COLUMN is_active DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.categories ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN (''1'', ''true'', ''t'') THEN TRUE ELSE FALSE END)';
    EXECUTE 'ALTER TABLE public.categories ALTER COLUMN is_active SET DEFAULT TRUE';
  END IF;

  -- 3. Conversion products.is_active -> BOOLEAN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active' AND data_type <> 'boolean'
  ) THEN
    EXECUTE 'ALTER TABLE public.products ALTER COLUMN is_active DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.products ALTER COLUMN is_active TYPE BOOLEAN USING (CASE WHEN is_active::text IN (''1'', ''true'', ''t'') THEN TRUE ELSE FALSE END)';
    EXECUTE 'ALTER TABLE public.products ALTER COLUMN is_active SET DEFAULT TRUE';
  END IF;

  -- 4. Conversion products.is_published -> BOOLEAN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_published' AND data_type <> 'boolean'
  ) THEN
    EXECUTE 'ALTER TABLE public.products ALTER COLUMN is_published DROP DEFAULT';
    EXECUTE 'ALTER TABLE public.products ALTER COLUMN is_published TYPE BOOLEAN USING (CASE WHEN is_published::text IN (''1'', ''true'', ''t'') THEN TRUE ELSE FALSE END)';
    EXECUTE 'ALTER TABLE public.products ALTER COLUMN is_published SET DEFAULT TRUE';
  END IF;
END $$;

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
  status               TEXT NOT NULL DEFAULT 'En attente de chiffrage',
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
-- FONCTION TRANSACTIONNELLE : CRÉATION ATOMIQUE DE COMMANDE
-- RÈGLE D'OR CYM PHARMA : Garantie d'intégrité transactionnelle.
-- Enregistre la commande + ses lignes + son historique dans une seule transaction ACID.
-- Statut initial : 'En attente de chiffrage'.
-- AUCUN prix ni montant financier n'est transmis par le client.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_order_data JSONB,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_caller_id UUID;
  v_is_admin BOOLEAN;
  v_order_id TEXT;
  v_order_number TEXT;
  v_est_name TEXT;
  v_ship_address TEXT;
  v_ship_city TEXT;
  v_ship_notes TEXT;
  v_item JSONB;
  v_item_count INT;
  v_result JSONB;
BEGIN
  -- Vérifier l'utilisateur appelant
  v_caller_id := auth.uid();
  v_is_admin := public.is_admin();

  -- Résolution et validation du propriétaire de la commande
  IF (p_order_data->>'user_id') IS NOT NULL AND (p_order_data->>'user_id') <> '' THEN
    v_user_id := (p_order_data->>'user_id')::UUID;
    IF v_caller_id IS NOT NULL AND v_caller_id <> v_user_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Non autorisé à créer une commande pour un autre compte client.';
    END IF;
  ELSE
    v_user_id := v_caller_id;
  END IF;

  -- Vérifier qu'il y a au moins un article valide
  v_item_count := jsonb_array_length(p_items);
  IF v_item_count IS NULL OR v_item_count = 0 THEN
    RAISE EXCEPTION 'La commande doit comporter au moins un article.';
  END IF;

  -- Génération du numéro de commande unique (ex: CMD-2026-4821)
  v_order_number := 'CMD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
  v_order_id := v_order_number;

  v_est_name := COALESCE(p_order_data->>'establishment_name', p_order_data->>'establishmentName', '');
  v_ship_address := COALESCE(p_order_data->>'shipping_address', '');
  v_ship_city := COALESCE(p_order_data->>'shipping_city', 'Abidjan');
  v_ship_notes := COALESCE(p_order_data->>'notes', p_order_data->>'shipping_notes', '');

  -- 1. Insertion de la commande (entête) avec statut officiel
  INSERT INTO public.orders (
    id,
    order_number,
    user_id,
    establishment_name,
    shipping_address,
    shipping_city,
    shipping_notes,
    notes,
    status,
    subtotal,
    total,
    currency
  ) VALUES (
    v_order_id,
    v_order_number,
    v_user_id,
    v_est_name,
    v_ship_address,
    v_ship_city,
    v_ship_notes,
    v_ship_notes,
    'En attente de chiffrage',
    0.00,
    0.00,
    'FCFA'
  );

  -- 2. Insertion de toutes les lignes de commande
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'quantity')::INT, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide (%s) pour l''article: %s', COALESCE(v_item->>'quantity', '0'), COALESCE(v_item->>'name', 'Inconnu');
    END IF;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      reference,
      name,
      unit,
      conditionnement,
      quantity,
      unit_price,
      line_total,
      currency
    ) VALUES (
      v_order_id,
      NULLIF(v_item->>'productId', ''),
      v_item->>'reference',
      COALESCE(v_item->>'name', 'Dispositif médical'),
      COALESCE(v_item->>'unit', 'Unité'),
      v_item->>'conditionnement',
      (v_item->>'quantity')::INT,
      0.00,
      0.00,
      'FCFA'
    );
  END LOOP;

  -- 3. Historique initial du statut
  INSERT INTO public.order_status_history (
    order_id,
    status,
    note,
    changed_by
  ) VALUES (
    v_order_id,
    'En attente de chiffrage',
    'Commande soumise par le client',
    v_caller_id
  );

  -- 4. Mise à jour de la date de dernière commande du profil client
  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET last_order_at = NOW(),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- 5. Construction de l'objet commande complet retourné
  SELECT jsonb_build_object(
    'order', jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'user_id', o.user_id,
      'establishment_name', o.establishment_name,
      'shipping_address', o.shipping_address,
      'shipping_city', o.shipping_city,
      'status', o.status,
      'notes', o.notes,
      'created_at', o.created_at,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'reference', oi.reference,
          'name', oi.name,
          'unit', oi.unit,
          'conditionnement', oi.conditionnement,
          'quantity', oi.quantity
        ))
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ), '[]'::jsonb)
    )
  ) INTO v_result
  FROM public.orders o
  WHERE o.id = v_order_id;

  RETURN v_result;
END;
$$;

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


-- =====================================================================
-- MIGRATION : 20261024000002_inventory_module.sql
-- =====================================================================

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


-- =====================================================================
-- MIGRATION : 20261024000003_rls_security_policies.sql
-- =====================================================================

-- =====================================================================
-- CYM PHARMA — MIGRATION 003 : SÉCURITÉ RLS & POLITIQUES D'ACCÈS (SUPABASE)
-- supabase/migrations/20261024000003_rls_security_policies.sql
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. FONCTION HELPER : VÉRIFICATION DU RÔLE ADMINISTRATEUR
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────
-- 2. VUE PUBLIQUE DU CATALOGUE PRODUITS
-- RÈGLE D'OR CYM PHARMA : Le client consulte les références et désignations
-- SANS AUCUN prix de référence (ref_price), AUCUN coût d'achat et AUCUNE quantité de stock.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.public_products AS
SELECT
  id,
  reference,
  name,
  description,
  category,
  category_main,
  unit,
  conditionnement,
  currency,
  is_active,
  is_published,
  image_url,
  created_at
FROM public.products
WHERE is_active = TRUE AND is_published = TRUE;

GRANT SELECT ON public.public_products TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. ACTIVATION RLS SUR TOUTES LES TABLES
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────
-- 4. POLITIQUES : PROFILES
-- ─────────────────────────────────────────────────────────────────────
-- Lecture : Utilisateur lui-même OU Administrateur
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

-- Mise à jour : Utilisateur lui-même (sauf le rôle) OU Administrateur
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.is_admin());

-- Insertion : Utilisateur lui-même (via trigger ou signup) OU Administrateur
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 5. POLITIQUES : CATEGORIES
-- ─────────────────────────────────────────────────────────────────────
-- Lecture : Tout le monde (public) pour les catégories actives
CREATE POLICY "categories_select_public" ON public.categories
  FOR SELECT
  USING (is_active = TRUE OR public.is_admin());

-- Écriture : Administrateur uniquement
CREATE POLICY "categories_admin_all" ON public.categories
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 6. POLITIQUES : PRODUCTS
-- Note : Les prix et stocks réels restent masqués côté front client.
-- ─────────────────────────────────────────────────────────────────────
-- Lecture : Produits actifs et publiés pour tous les utilisateurs authentifiés et anonymes
CREATE POLICY "products_select_published" ON public.products
  FOR SELECT
  USING (is_active = TRUE AND is_published = TRUE OR public.is_admin());

-- Modifications / Ajouts / Suppressions : Administrateur uniquement
CREATE POLICY "products_admin_all" ON public.products
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 7. POLITIQUES : ORDERS
-- ─────────────────────────────────────────────────────────────────────
-- Lecture : Le client accède à ses propres commandes. L'admin voit tout.
CREATE POLICY "orders_select_policy" ON public.orders
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Création : Client connecté peut créer sa commande sans prix. L'admin peut créer.
CREATE POLICY "orders_insert_policy" ON public.orders
  FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Modification (statut, prix chiffrés, annulation) : Administrateur uniquement
CREATE POLICY "orders_update_policy" ON public.orders
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 8. POLITIQUES : ORDER_ITEMS
-- ─────────────────────────────────────────────────────────────────────
-- Lecture : Uniquement si la commande parente est accessible par l'utilisateur
CREATE POLICY "order_items_select_policy" ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND (orders.user_id = auth.uid() OR public.is_admin())
    )
  );

-- Création : Uniquement si la commande parente appartient à l'utilisateur ou admin
CREATE POLICY "order_items_insert_policy" ON public.order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND (orders.user_id = auth.uid() OR public.is_admin())
    )
  );

-- Modification / Suppression : Administrateur uniquement
CREATE POLICY "order_items_admin_all" ON public.order_items
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 9. POLITIQUES : MODULE INVENTAIRE (CONFIDENTIALITÉ STRICTE — ADMIN SEUL)
-- ─────────────────────────────────────────────────────────────────────
CREATE POLICY "inventory_items_admin_only" ON public.inventory_items
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "inventory_periods_admin_only" ON public.inventory_periods
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "stock_movements_admin_only" ON public.stock_movements
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "inventory_counts_admin_only" ON public.inventory_counts
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 10. POLITIQUES : BONS DE LIVRAISON & HISTORIQUE STATUTS
-- ─────────────────────────────────────────────────────────────────────
CREATE POLICY "delivery_notes_select_policy" ON public.delivery_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = delivery_notes.order_id
        AND (orders.user_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "delivery_notes_admin_all" ON public.delivery_notes
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "order_status_history_select_policy" ON public.order_status_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_status_history.order_id
        AND (orders.user_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "order_status_history_admin_all" ON public.order_status_history
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 11. POLITIQUES : RELANCES & CONTACT
-- ─────────────────────────────────────────────────────────────────────
CREATE POLICY "relance_logs_admin_only" ON public.relance_logs
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Formulaire de contact : N'importe qui (anonyme ou connecté) peut poster
CREATE POLICY "contact_insert_public" ON public.contact_messages
  FOR INSERT
  WITH CHECK (true);

-- Consultation des messages de contact : Administrateur uniquement
CREATE POLICY "contact_admin_select" ON public.contact_messages
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "contact_admin_update" ON public.contact_messages
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 12. PERMISSIONS D'EXÉCUTION DES FONCTIONS SÉCURISÉES
-- ─────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB) TO anon, authenticated, service_role;



-- =====================================================================
-- MIGRATION : 20261024000004_whatsapp_support.sql
-- =====================================================================

-- =====================================================================
-- CYM PHARMA — MIGRATION 004 : SUPPORT WHATSAPP BUSINESS CLOUD API
-- supabase/migrations/20261024000004_whatsapp_support.sql
-- =====================================================================
-- Ajoute les colonnes nécessaires à relance_logs et profiles
-- pour le suivi réel des envois WhatsApp Business Cloud API.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. relance_logs — colonnes WhatsApp
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.relance_logs
  ADD COLUMN IF NOT EXISTS whatsapp_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_direct_url  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_status       TEXT CHECK (whatsapp_status IN ('sent', 'delivered', 'read', 'failed', 'pending'));

CREATE INDEX IF NOT EXISTS idx_relance_wa_status ON public.relance_logs(whatsapp_status);

-- ─────────────────────────────────────────────────────────────────────
-- 2. profiles — champs de suivi relance
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS relance_count         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_relance_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_relance_channel   TEXT CHECK (last_relance_channel IN ('whatsapp', 'email', 'multichannel')),
  ADD COLUMN IF NOT EXISTS last_relance_status    TEXT CHECK (last_relance_status IN ('sent', 'delivered', 'failed', 'pending'));

CREATE INDEX IF NOT EXISTS idx_profiles_last_relance ON public.profiles(last_relance_at);

-- ─────────────────────────────────────────────────────────────────────
-- 3. Vue calculée : clients inactifs avec métriques de relance
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_inactive_clients AS
SELECT
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  p.establishment_name,
  p.commune,
  p.status,
  p.last_order_at,
  p.last_relance_at,
  p.last_relance_channel,
  p.last_relance_status,
  p.relance_count,
  EXTRACT(DAY FROM NOW() - p.last_order_at)::INTEGER  AS days_since_last_order,
  COUNT(o.id)                                          AS total_orders,
  COALESCE(SUM(o.total), 0)                            AS total_spent
FROM public.profiles p
LEFT JOIN public.orders o ON o.user_id = p.id
WHERE
  p.role = 'client'
  AND (
    p.last_order_at IS NULL
    OR p.last_order_at < NOW() - INTERVAL '60 days'
  )
GROUP BY
  p.id, p.email, p.first_name, p.last_name, p.phone,
  p.establishment_name, p.commune, p.status,
  p.last_order_at, p.last_relance_at, p.last_relance_channel,
  p.last_relance_status, p.relance_count;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Fonction Supabase : vérification automatique de l'inactivité
--    Appelée par pg_cron toutes les nuits à 02h00 (Abidjan, UTC+0)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_inactive_clients()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER := 0;
  cutoff_date   TIMESTAMPTZ := NOW() - INTERVAL '60 days';
BEGIN
  WITH updated AS (
    UPDATE public.profiles
    SET
      status     = 'inactive',
      updated_at = NOW()
    WHERE
      role = 'client'
      AND status = 'active'
      AND (last_order_at IS NULL OR last_order_at < cutoff_date)
    RETURNING id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RETURN jsonb_build_object(
    'success', TRUE,
    'newly_inactive', updated_count,
    'checked_at', NOW()
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Politiques RLS pour relance_logs
-- (les admins voient tout, les clients ne voient rien)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.relance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_full_relance_logs" ON public.relance_logs;
CREATE POLICY "admin_full_relance_logs"
  ON public.relance_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 6. Commentaires métier
-- ─────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.relance_logs IS
  'Journal certifié de toutes les relances B2B envoyées aux clients inactifs via WhatsApp Business Cloud API et/ou Email.';

COMMENT ON COLUMN public.relance_logs.status IS
  'Statut de la tentative d''envoi : sent = API a confirmé, failed = API a échoué, pending = non configuré.';

COMMENT ON COLUMN public.relance_logs.whatsapp_message_id IS
  'ID retourné par la WhatsApp Cloud API lors d''un envoi réussi (format wamid.*).';

COMMENT ON COLUMN public.relance_logs.whatsapp_direct_url IS
  'Lien wa.me/ de secours avec le message pré-rempli, généré même en cas d''échec API.';


-- =====================================================================
-- MIGRATION : 20261024000005_client_reminders.sql
-- =====================================================================

-- =====================================================================
-- CYM PHARMA — MIGRATION 005 : RELANCES MANUELLES WHATSAPP & MODÈLES B2B
-- supabase/migrations/20261024000005_client_reminders.sql
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Ajout de last_reminder_at sur public.profiles
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_reminder ON public.profiles(last_reminder_at);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Table des modèles officiels de relance (texte brut, sans emoji)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_templates (
  template_key  VARCHAR(64) PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  content       TEXT NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  warning_note  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Amorçage des 4 modèles officiels sans emoji
INSERT INTO public.reminder_templates (template_key, title, content, is_default, warning_note)
VALUES
  (
    'reprise_contact',
    'Reprise de contact',
    'Bonjour {responsable}, c''est CYM Pharma. Nous n''avons pas reçu de commande de {structure} depuis un moment. Avez-vous un besoin à nous confier ? Nous restons disponibles.',
    TRUE,
    NULL
  ),
  (
    'reappro',
    'Réapprovisionnement',
    'Bonjour {responsable}, c''est CYM Pharma. Souhaitez-vous que nous préparions un réapprovisionnement pour {structure} ? Dites-nous vos références.',
    FALSE,
    NULL
  ),
  (
    'espace_client',
    'Votre espace client',
    'Bonjour {responsable}, c''est CYM Pharma. Votre espace client vous permet de commander et de suivre vos livraisons à tout moment. Besoin d''aide pour vous connecter ?',
    FALSE,
    NULL
  ),
  (
    'nouveautes',
    'Nouveautés',
    'Bonjour {responsable}, c''est CYM Pharma. De nouvelles références sont disponibles dans notre catalogue. Souhaitez-vous que nous vous les présentions ?',
    FALSE,
    'Ne doit être utilisé que si de nouvelles références réelles ont été récemment ajoutées au catalogue.'
  )
ON CONFLICT (template_key) DO UPDATE
SET
  title        = EXCLUDED.title,
  content      = EXCLUDED.content,
  is_default   = EXCLUDED.is_default,
  warning_note = EXCLUDED.warning_note;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Table des relances manuelles WhatsApp (traçabilité réelle)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel       VARCHAR(32) NOT NULL DEFAULT 'whatsapp_manuel',
  template_key  VARCHAR(64) NOT NULL REFERENCES public.reminder_templates(template_key),
  opened_by     UUID NOT NULL REFERENCES public.profiles(id),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ,
  status        VARCHAR(20) NOT NULL DEFAULT 'opened' CHECK (status IN ('opened', 'confirmed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_reminders_user_id ON public.client_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_client_reminders_status ON public.client_reminders(status);
CREATE INDEX IF NOT EXISTS idx_client_reminders_opened_at ON public.client_reminders(opened_at DESC);

-- Trigger : mise à jour de last_reminder_at lors de la confirmation
CREATE OR REPLACE FUNCTION public.handle_reminder_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    NEW.confirmed_at = COALESCE(NEW.confirmed_at, NOW());
    UPDATE public.profiles
    SET last_reminder_at = NEW.confirmed_at
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_client_reminder_confirmed ON public.client_reminders;
CREATE TRIGGER on_client_reminder_confirmed
  BEFORE UPDATE ON public.client_reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_reminder_confirmation();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Politiques RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.reminder_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_reminders ENABLE ROW LEVEL SECURITY;

-- reminder_templates : lecture par tout utilisateur authentifié, écriture admin uniquement
DROP POLICY IF EXISTS "reminder_templates_read" ON public.reminder_templates;
CREATE POLICY "reminder_templates_read"
  ON public.reminder_templates
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "reminder_templates_admin_write" ON public.reminder_templates;
CREATE POLICY "reminder_templates_admin_write"
  ON public.reminder_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- client_reminders : accès réservé aux administrateurs
DROP POLICY IF EXISTS "client_reminders_admin_all" ON public.client_reminders;
CREATE POLICY "client_reminders_admin_all"
  ON public.client_reminders
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
