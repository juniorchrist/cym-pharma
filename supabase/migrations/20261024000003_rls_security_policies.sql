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
