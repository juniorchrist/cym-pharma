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
