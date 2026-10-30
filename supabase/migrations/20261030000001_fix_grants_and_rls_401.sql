-- =====================================================================
-- CYM PHARMA — MIGRATION 20261030000001 : RÉSOLUTION DES ERREURS HTTP 401
-- Attribution des privilèges GRANT et politiques d'accès Supabase PostgREST
-- supabase/migrations/20261030000001_fix_grants_and_rls_401.sql
-- =====================================================================

-- 1. Accès au schéma public pour les rôles PostgREST
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Privilèges sur les tables publiques du catalogue
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.public_products TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;

-- 3. Privilèges profils utilisateurs
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- 4. Privilèges commandes et lignes de commandes
GRANT SELECT, INSERT ON public.orders TO authenticated, anon;
GRANT SELECT, INSERT ON public.order_items TO authenticated, anon;
GRANT SELECT ON public.order_status_history TO authenticated;
GRANT SELECT ON public.delivery_notes TO authenticated;

-- 5. Privilèges formulaire de contact (visiteurs anonymes et clients)
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;

-- 6. Privilèges relances et modèles de rappel
GRANT SELECT, INSERT, UPDATE ON public.client_reminders TO authenticated;
GRANT SELECT ON public.reminder_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.relance_logs TO authenticated;

-- 7. Privilèges sur les séquences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 8. Privilèges d'exécution des fonctions RPC
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB) TO anon, authenticated, service_role;

-- 9. Privilèges par défaut pour les futures tables créées
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

-- 10. Vérification et renforcement des politiques RLS essentielles
-- S'assurer que RLS est actif
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Politique lecture catégories si non existante
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_select_public'
  ) THEN
    CREATE POLICY "categories_select_public" ON public.categories
      FOR SELECT USING (is_active = TRUE OR public.is_admin());
  END IF;
END $$;

-- Politique insertion contact public si non existante
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_messages' AND policyname = 'contact_insert_public'
  ) THEN
    CREATE POLICY "contact_insert_public" ON public.contact_messages
      FOR INSERT WITH CHECK (TRUE);
  END IF;
END $$;

-- Politique sélection contact pour admin si non existante
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'contact_messages' AND policyname = 'contact_admin_select'
  ) THEN
    CREATE POLICY "contact_admin_select" ON public.contact_messages
      FOR SELECT USING (public.is_admin());
  END IF;
END $$;

-- Rôle service_role a tous les droits sur toutes les tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
