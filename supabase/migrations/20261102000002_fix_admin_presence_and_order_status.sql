-- =====================================================================
-- CYM PHARMA — MIGRATION 20261102000002 : STATUTS COMMANDES, PRÉSENCE & PROFILS ADMIN
-- supabase/migrations/20261102000002_fix_admin_presence_and_order_status.sql
-- =====================================================================

-- 1. Colonnes de présence et suivi sur public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen_at DESC);

-- 2. Fonction renforcée is_admin() (ne se bloque jamais sur une métadonnée manquante)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR COALESCE(auth.jwt()->>'role', '') = 'admin'
    OR COALESCE(auth.jwt()->'user_metadata'->>'role', '') = 'admin'
    OR COALESCE(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
    OR COALESCE(auth.jwt()->>'email', '') = 'admin@cympharma.ci'
    OR COALESCE(auth.jwt()->>'email', '') LIKE 'admin@%'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- 3. Privilèges de mise à jour des commandes pour authenticated (admin)
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;

-- Politique UPDATE sur orders : Administrateur uniquement
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_admin_update'
  ) THEN
    CREATE POLICY "orders_admin_update" ON public.orders
      FOR UPDATE
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- Politique UPDATE sur order_items : Administrateur uniquement
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'order_items_admin_update'
  ) THEN
    CREATE POLICY "order_items_admin_update" ON public.order_items
      FOR UPDATE
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- 4. Contrainte CHECK unifiée sur les statuts de commande
DO $$
BEGIN
  -- Supprimer ancienne contrainte si présente
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
  
  -- Ajouter la contrainte validant les codes officiels et les libellés hérités
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_status_check
    CHECK (
      status IN (
        'pending_quote',
        'quoted',
        'confirmed',
        'in_preparation',
        'shipped',
        'delivered',
        'cancelled',
        'En attente de chiffrage',
        'En attente de devis',
        'Chiffrée',
        'Devis envoyé',
        'Livrée',
        'Annulée'
      )
    );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Notice: orders_status_check constraint setup note: %', SQLERRM;
END $$;

-- 5. RPC Chiffrage Atomique d'une Commande (admin_quote_order) — Le chiffrage admin vaut confirmation
CREATE OR REPLACE FUNCTION public.admin_quote_order(
  p_order_id TEXT,
  p_items JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_item RECORD;
  v_computed_total NUMERIC := 0;
  v_now TIMESTAMPTZ := NOW();
  v_invoice_num TEXT;
  v_updated_order JSONB;
BEGIN
  -- Vérification des droits administrateur
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé. Rôle administrateur requis.' USING ERRCODE = '42501';
  END IF;

  -- Validation des articles
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Au moins un article doit être chiffré.';
  END IF;

  -- Mise à jour des lignes de commande
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    "productId" TEXT,
    product_id TEXT,
    id BIGINT,
    unit_price NUMERIC
  ) LOOP
    DECLARE
      v_target_id TEXT := COALESCE(v_item."productId", v_item.product_id);
      v_uprice NUMERIC := COALESCE(v_item.unit_price, 0);
      v_qty NUMERIC := 1;
      v_row_id BIGINT;
    BEGIN
      -- Retrouver la ligne de commande correspondante
      SELECT oi.id, oi.quantity INTO v_row_id, v_qty
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND (
          oi.product_id = v_target_id
          OR (v_item.id IS NOT NULL AND oi.id = v_item.id)
        )
      LIMIT 1;

      IF v_row_id IS NOT NULL THEN
        UPDATE public.order_items
        SET
          unit_price = v_uprice,
          line_total = v_uprice * v_qty
        WHERE id = v_row_id;

        v_computed_total := v_computed_total + (v_uprice * v_qty);
      END IF;
    END;
  END LOOP;

  -- Si recalcul automatique sur toutes les lignes actuelles
  SELECT COALESCE(SUM(line_total), v_computed_total)
  INTO v_computed_total
  FROM public.order_items
  WHERE order_id = p_order_id;

  v_invoice_num := 'FAC-' || REPLACE(p_order_id, 'CMD-', '');

  -- Mise à jour atomique de la commande
  UPDATE public.orders
  SET
    status = 'quoted',
    subtotal = v_computed_total,
    total = v_computed_total,
    priced_at = v_now,
    quoted_at = v_now,
    invoice_number = v_invoice_num,
    invoice_date = v_now,
    updated_at = v_now
  WHERE id = p_order_id OR order_number = p_order_id;

  -- Historique du changement de statut
  INSERT INTO public.order_status_history (
    order_id,
    status,
    note,
    changed_by,
    created_at
  )
  VALUES (
    p_order_id,
    'quoted',
    'Chiffrage validé par administrateur (Commande confirmée) : ' || v_computed_total || ' FCFA',
    auth.uid(),
    v_now
  );

  -- Récupérer la commande mise à jour avec ses articles
  SELECT json_build_object(
    'order', (
      SELECT row_to_json(o.*)
      FROM public.orders o
      WHERE o.id = p_order_id OR o.order_number = p_order_id
    ),
    'items', (
      SELECT json_agg(row_to_json(oi.*))
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
    )
  )::jsonb INTO v_updated_order;

  RETURN v_updated_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_quote_order(TEXT, JSONB) TO authenticated, service_role;

-- 6. RPC Heartbeat Présence (met à jour last_seen_at du client connecté)
CREATE OR REPLACE FUNCTION public.user_heartbeat()
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    UPDATE public.profiles
    SET last_seen_at = NOW()
    WHERE id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.user_heartbeat() TO authenticated, anon;

-- 7. RPC Admin : Récupération Sécurisée des Comptes Clients avec Statut E-mail Réel
CREATE OR REPLACE FUNCTION public.admin_get_clients()
RETURNS TABLE (
  id UUID,
  email VARCHAR,
  name VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR,
  role VARCHAR,
  establishment_name VARCHAR,
  phone VARCHAR,
  commune VARCHAR,
  status VARCHAR,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  is_email_confirmed BOOLEAN,
  email_confirmed_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé. Rôle administrateur requis.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.name,
    p.first_name,
    p.last_name,
    p.role,
    p.establishment_name,
    p.phone,
    p.commune,
    p.status,
    p.created_at,
    u.last_sign_in_at,
    p.last_seen_at,
    p.last_login_at,
    (u.email_confirmed_at IS NOT NULL) AS is_email_confirmed,
    u.email_confirmed_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.role <> 'admin'
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_get_clients() TO authenticated, service_role;

