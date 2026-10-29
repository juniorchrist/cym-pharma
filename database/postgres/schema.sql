-- =====================================================================
-- CYM PHARMA — SCHÉMA CANONIQUE PostgreSQL (Supabase)
-- database/postgres/schema.sql
-- Version : 2.0 — Source de vérité pour Supabase (test) et
--           tout hébergement PostgreSQL 14+.
-- =====================================================================
-- Ordre d'exécution sur un projet Supabase vide :
--   1. postgres/schema.sql
--   2. postgres/migrations/NNN_*.sql  (dans l'ordre numérique)
--   3. seeds/admin.postgres.sql
-- =====================================================================
-- SÉCURITÉ : RLS activé sur toutes les tables publiques.
--            Aucune politique = accès refusé par défaut.
--            L'accès passe UNIQUEMENT par le backend PHP via la
--            connexion PostgreSQL directe (rôle db_user), jamais
--            par le client Supabase JS avec anon/authenticated.
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 0. SUIVI DES MIGRATIONS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    TEXT        NOT NULL PRIMARY KEY,
  name       TEXT        NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────
-- 1. UTILISATEURS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                    TEXT         NOT NULL PRIMARY KEY,
  email                 TEXT         NOT NULL UNIQUE,
  password_hash         TEXT         NOT NULL,
  role                  TEXT         NOT NULL DEFAULT 'client'
                          CHECK (role IN ('admin','client')),
  name                  TEXT,
  first_name            TEXT,
  last_name             TEXT,
  phone                 TEXT,
  establishment_name    TEXT,
  establishment_type    TEXT,
  commune               TEXT,
  address               TEXT,
  org                   TEXT,
  status                TEXT         NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('active','inactive','suspended','pending')),
  email_verified_at     TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  last_order_at         TIMESTAMPTZ,
  last_reminder_at      TIMESTAMPTZ,
  failed_login_attempts SMALLINT     NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role   ON public.users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status);

-- ─────────────────────────────────────────────────────────────────────
-- 2. CATÉGORIES DE PRODUITS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id         SERIAL       NOT NULL PRIMARY KEY,
  slug       TEXT         NOT NULL UNIQUE,
  name       TEXT         NOT NULL,
  parent_id  INT          REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order SMALLINT     NOT NULL DEFAULT 0,
  is_active  SMALLINT     NOT NULL DEFAULT 1
               CHECK (is_active IN (0,1)),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cat_slug   ON public.categories (slug);
CREATE INDEX IF NOT EXISTS idx_cat_active ON public.categories (is_active);

-- ─────────────────────────────────────────────────────────────────────
-- 3. PRODUITS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id              TEXT           NOT NULL PRIMARY KEY,
  reference       TEXT           NOT NULL UNIQUE,
  name            TEXT           NOT NULL,
  description     TEXT,
  category        TEXT,
  category_main   TEXT,
  unit            TEXT           DEFAULT 'Unité',
  conditionnement TEXT,
  ref_price       NUMERIC(12,2)  NOT NULL DEFAULT 0.00,
  price           NUMERIC(12,2)  NOT NULL DEFAULT 0.00,
  currency        TEXT           NOT NULL DEFAULT 'FCFA',
  is_active       SMALLINT       NOT NULL DEFAULT 1
                    CHECK (is_active IN (0,1)),
  is_published    SMALLINT       NOT NULL DEFAULT 0
                    CHECK (is_published IN (0,1)),
  image_url       TEXT,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prod_ref      ON public.products (reference);
CREATE INDEX IF NOT EXISTS idx_prod_category ON public.products (category_main);
CREATE INDEX IF NOT EXISTS idx_prod_active   ON public.products (is_active, is_published);

-- ─────────────────────────────────────────────────────────────────────
-- 4. COMMANDES
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                 TEXT           NOT NULL PRIMARY KEY,
  order_number       TEXT           NOT NULL UNIQUE,
  user_id            TEXT           REFERENCES public.users(id) ON DELETE SET NULL,
  establishment_name TEXT,
  shipping_address   TEXT,
  shipping_city      TEXT,
  status             TEXT           NOT NULL DEFAULT 'En attente de devis',
  notes              TEXT,
  subtotal           NUMERIC(14,2)  NOT NULL DEFAULT 0.00,
  total              NUMERIC(14,2)  NOT NULL DEFAULT 0.00,
  currency           TEXT           NOT NULL DEFAULT 'FCFA',
  invoice_number     TEXT,
  invoice_date       TIMESTAMPTZ,
  priced_at          TIMESTAMPTZ,
  shipped_at         TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  cancel_reason      TEXT,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user   ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders (order_number);

-- ─────────────────────────────────────────────────────────────────────
-- 5. LIGNES DE COMMANDE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  order_id   TEXT           NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT,
  reference  TEXT,
  name       TEXT           NOT NULL,
  unit       TEXT           DEFAULT 'Unité',
  quantity   INT            NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2)  NOT NULL DEFAULT 0.00,
  line_total NUMERIC(14,2)  NOT NULL DEFAULT 0.00,
  currency   TEXT           NOT NULL DEFAULT 'FCFA',
  created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oi_order   ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_oi_product ON public.order_items (product_id);

-- ─────────────────────────────────────────────────────────────────────
-- 6. HISTORIQUE DES STATUTS DE COMMANDE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  order_id   TEXT        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL,
  note       TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_osh_order ON public.order_status_history (order_id);

-- ─────────────────────────────────────────────────────────────────────
-- 7. BONS DE LIVRAISON
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id           TEXT        NOT NULL PRIMARY KEY,
  order_id     TEXT        NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  bl_number    TEXT        NOT NULL UNIQUE,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  notes        TEXT
);

-- ─────────────────────────────────────────────────────────────────────
-- 8. MESSAGES DE CONTACT
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  phone      TEXT,
  org        TEXT,
  subject    TEXT,
  message    TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_email ON public.contact_messages (email);

-- ─────────────────────────────────────────────────────────────────────
-- 9. LOGS DE RELANCE HISTORIQUE (conservé pour l'historique e-mail)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.relance_logs (
  id                    TEXT        NOT NULL PRIMARY KEY,
  user_id               TEXT        REFERENCES public.users(id) ON DELETE SET NULL,
  user_name             TEXT,
  establishment_name    TEXT,
  recipient_email       TEXT,
  recipient_phone       TEXT,
  channel               TEXT        DEFAULT 'email',
  subject               TEXT,
  message               TEXT,
  trigger_reason        TEXT,
  days_since_last_order INT,
  status                TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('sent','failed','pending')),
  sent_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_relance_user   ON public.relance_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_relance_status ON public.relance_logs (status);

-- ─────────────────────────────────────────────────────────────────────
-- 10. MODULE INVENTAIRE — Articles
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id               TEXT        NOT NULL PRIMARY KEY,
  code             TEXT        NOT NULL UNIQUE,
  designation      TEXT        NOT NULL,
  designation_norm TEXT        NOT NULL,
  unit_label       TEXT        DEFAULT 'Unité',
  product_id       TEXT,
  min_stock        INT         DEFAULT 5,
  is_tracked       SMALLINT    NOT NULL DEFAULT 1
                     CHECK (is_tracked IN (0,1)),
  qty_on_hand      INT         NOT NULL DEFAULT 0,
  is_active        SMALLINT    NOT NULL DEFAULT 1
                     CHECK (is_active IN (0,1)),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_code       ON public.inventory_items (code);
CREATE INDEX IF NOT EXISTS idx_inv_product_id ON public.inventory_items (product_id);
CREATE INDEX IF NOT EXISTS idx_inv_tracked    ON public.inventory_items (is_tracked);
CREATE INDEX IF NOT EXISTS idx_inv_active     ON public.inventory_items (is_active);

-- ─────────────────────────────────────────────────────────────────────
-- 11. MODULE INVENTAIRE — Mouvements de stock (journal append-only)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            TEXT        NOT NULL PRIMARY KEY,
  item_id       TEXT        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type          TEXT        NOT NULL
                  CHECK (type IN (
                    'opening','purchase','sale_shop','sale_online',
                    'return','loss','adjustment','count_correction'
                  )),
  quantity      INT         NOT NULL,
  movement_date DATE        NOT NULL,
  reason        TEXT,
  order_id      TEXT,
  order_item_id TEXT,
  period_id     TEXT,
  created_by    TEXT        NOT NULL DEFAULT 'Admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mvt_item_id ON public.stock_movements (item_id);
CREATE INDEX IF NOT EXISTS idx_mvt_type    ON public.stock_movements (type);
CREATE INDEX IF NOT EXISTS idx_mvt_date    ON public.stock_movements (movement_date);
CREATE INDEX IF NOT EXISTS idx_mvt_period  ON public.stock_movements (period_id);

-- ─────────────────────────────────────────────────────────────────────
-- 12. MODULE INVENTAIRE — Périodes de comptage physique
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_periods (
  id         TEXT        NOT NULL PRIMARY KEY,
  year_month TEXT        NOT NULL UNIQUE,   -- ex: '2026-10'
  status     TEXT        NOT NULL DEFAULT 'counting'
               CHECK (status IN ('open','counting','closed')),
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at  TIMESTAMPTZ,
  closed_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_per_year_month ON public.inventory_periods (year_month);
CREATE INDEX IF NOT EXISTS idx_per_status     ON public.inventory_periods (status);

-- ─────────────────────────────────────────────────────────────────────
-- 13. MODULE INVENTAIRE — Comptages physiques par période
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id              TEXT        NOT NULL PRIMARY KEY,
  period_id       TEXT        NOT NULL REFERENCES public.inventory_periods(id) ON DELETE CASCADE,
  item_id         TEXT        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  theoretical_qty INT         NOT NULL DEFAULT 0,
  counted_qty     INT,
  variance        INT,
  note            TEXT,
  counted_by      TEXT,
  counted_at      TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','validated','skipped')),
  UNIQUE (period_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_cnt_period ON public.inventory_counts (period_id);
CREATE INDEX IF NOT EXISTS idx_cnt_item   ON public.inventory_counts (item_id);

-- ─────────────────────────────────────────────────────────────────────
-- 14. MODULE INVENTAIRE — Instantanés de clôture de période
-- ─────────────────────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_snap_period ON public.period_items (period_id);
CREATE INDEX IF NOT EXISTS idx_snap_item   ON public.period_items (item_id);

-- ─────────────────────────────────────────────────────────────────────
-- 15. RELANCES MANUELLES WHATSAPP
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_reminders (
  id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id      TEXT        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel      TEXT        NOT NULL DEFAULT 'whatsapp_manuel',
  template_key TEXT        NOT NULL,
  opened_by    TEXT        NOT NULL,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  status       TEXT        NOT NULL DEFAULT 'opened'
                 CHECK (status IN ('opened','confirmed','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cr_user_id   ON public.client_reminders (user_id);
CREATE INDEX IF NOT EXISTS idx_cr_status    ON public.client_reminders (status);
CREATE INDEX IF NOT EXISTS idx_cr_opened_at ON public.client_reminders (opened_at);

-- ─────────────────────────────────────────────────────────────────────
-- 16. MODÈLES DE MESSAGES DE RELANCE
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_templates (
  id           BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  template_key TEXT        NOT NULL UNIQUE,
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  warning_note TEXT,
  is_default   SMALLINT    NOT NULL DEFAULT 0
                 CHECK (is_default IN (0,1)),
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_key ON public.reminder_templates (template_key);

-- Amorçage des modèles par défaut
INSERT INTO public.reminder_templates
  (template_key, title, content, warning_note, is_default, sort_order)
VALUES
  ('reprise_contact',    'Reprise de contact',
   'Bonjour {responsable}, c''est CYM Pharma. Nous n''avons pas reçu de commande de {structure} depuis un moment. Avez-vous un besoin à nous confier ? Nous restons disponibles.',
   NULL, 1, 1),
  ('reapprovisionnement','Réapprovisionnement',
   'Bonjour {responsable}, c''est CYM Pharma. Souhaitez-vous que nous préparions un réapprovisionnement pour {structure} ? Dites-nous vos références.',
   NULL, 0, 2),
  ('espace_client',      'Votre espace client',
   'Bonjour {responsable}, c''est CYM Pharma. Votre espace client vous permet de commander et de suivre vos livraisons à tout moment. Besoin d''aide pour vous connecter ?',
   NULL, 0, 3),
  ('nouveautes',         'Nouveautés',
   'Bonjour {responsable}, c''est CYM Pharma. De nouvelles références sont disponibles dans notre catalogue. Souhaitez-vous que nous vous les présentions ?',
   'À utiliser uniquement si de nouvelles références réelles ont été ajoutées au catalogue.', 0, 4)
ON CONFLICT (template_key) DO UPDATE SET
  title        = EXCLUDED.title,
  is_default   = EXCLUDED.is_default,
  sort_order   = EXCLUDED.sort_order,
  warning_note = EXCLUDED.warning_note;

-- ─────────────────────────────────────────────────────────────────────
-- 17. TRIGGERS updated_at automatiques
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users','products','client_reminders','reminder_templates'
  ] LOOP
    EXECUTE format($f$
      DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
      CREATE TRIGGER trg_%1$s_updated_at
        BEFORE UPDATE ON public.%1$s
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    $f$, tbl);
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 18. SÉCURITÉ SUPABASE — Row Level Security (RLS)
-- Principe : RLS activé + aucune politique = accès refusé par défaut.
-- Le backend PHP se connecte avec un rôle db_user (service_role ou
-- un rôle dédié) qui contourne le RLS. Les rôles anon/authenticated
-- n'ont aucun accès aux données métier.
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users','categories','products','orders','order_items',
    'order_status_history','delivery_notes','contact_messages',
    'relance_logs','inventory_items','stock_movements',
    'inventory_periods','inventory_counts','period_items',
    'client_reminders','reminder_templates','schema_migrations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END;
$$;

-- Révocation explicite de tous les droits sur les rôles Supabase publics
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Vérification post-déploiement — coller en console Supabase pour
-- confirmer que toutes les tables ont RLS activé et 0 politique :
--
--   SELECT tablename,
--          rowsecurity,
--          (SELECT count(*) FROM pg_policies p
--           WHERE p.tablename = t.tablename) AS policy_count
--   FROM pg_tables t
--   WHERE schemaname = 'public'
--   ORDER BY tablename;
-- ─────────────────────────────────────────────────────────────────────

-- Enregistrement de version
INSERT INTO public.schema_migrations (version, name)
VALUES ('2.0', 'schema_initial_canonique')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
