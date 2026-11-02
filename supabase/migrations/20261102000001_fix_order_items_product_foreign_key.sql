-- =====================================================================
-- CYM PHARMA — MIGRATION 20261102000001
-- CORRECTION DÉFINITIVE DE LA CONTRAINTE order_items_product_id_fkey
-- =====================================================================
-- 1. Sécurisation et validation atomique dans create_order_atomic
--    - Vérifie l'existence de CHAQUE produit dans public.products avant insertion
--    - Résout la véritable clé primaire products(id) (tolérance id et reference)
--    - Interrompt proprement la transaction avec message explicite si produit introuvable
--    - Garantit qu'aucune commande partielle n'est créée (ACID)
--    - Garantit que order_items.product_id référence TOUJOURS un id valide de products
-- 2. Maintien strict de la contrainte FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
-- 3. Droits d'exécution RPC pour anon, authenticated, service_role
-- =====================================================================

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
  
  -- Variables de résolution produit
  v_raw_product_id TEXT;
  v_raw_reference TEXT;
  v_item_name TEXT;
  v_item_qty INT;
  v_product RECORD;
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

  -- ── ÉTAPE 1 : VALIDATION PRÉALABLE STRICTE DE TOUS LES PRODUITS ──
  -- Vérifier que CHAQUE article existe dans public.products avant toute écriture.
  -- Si un seul article est introuvable, lever une exception pour annuler toute la transaction.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_qty := COALESCE((v_item->>'quantity')::INT, 0);
    v_item_name := COALESCE(v_item->>'name', 'Dispositif médical');

    IF v_item_qty <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide (%s) pour l''article: %s', COALESCE(v_item->>'quantity', '0'), v_item_name;
    END IF;

    v_raw_product_id := COALESCE(NULLIF(TRIM(v_item->>'productId'), ''), NULLIF(TRIM(v_item->>'product_id'), ''));
    v_raw_reference := NULLIF(TRIM(v_item->>'reference'), '');

    -- Recherche du produit par sa clé primaire id, ou subsidiairement par sa référence commerciale
    SELECT id, reference, name, unit, conditionnement
    INTO v_product
    FROM public.products
    WHERE (v_raw_product_id IS NOT NULL AND id = v_raw_product_id)
       OR (v_raw_product_id IS NOT NULL AND reference = v_raw_product_id)
       OR (v_raw_reference IS NOT NULL AND reference = v_raw_reference)
    LIMIT 1;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Produit introuvable dans le catalogue : "%s". Veuillez actualiser votre panier.', v_item_name;
    END IF;
  END LOOP;

  -- ── ÉTAPE 2 : GÉNÉRATION DU NUMÉRO DE COMMANDE ──
  v_order_number := 'CMD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
  v_order_id := v_order_number;

  v_est_name := COALESCE(p_order_data->>'establishment_name', p_order_data->>'establishmentName', '');
  v_ship_address := COALESCE(p_order_data->>'shipping_address', '');
  v_ship_city := COALESCE(p_order_data->>'shipping_city', 'Abidjan');
  v_ship_notes := COALESCE(p_order_data->>'notes', p_order_data->>'shipping_notes', '');

  -- ── ÉTAPE 3 : INSERTION DE L'EN-TÊTE DE COMMANDE ──
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

  -- ── ÉTAPE 4 : INSERTION DES LIGNES AVEC LA VRAIE CLÉ PRIMAIRE ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_raw_product_id := COALESCE(NULLIF(TRIM(v_item->>'productId'), ''), NULLIF(TRIM(v_item->>'product_id'), ''));
    v_raw_reference := NULLIF(TRIM(v_item->>'reference'), '');

    SELECT id, reference, name, unit, conditionnement
    INTO v_product
    FROM public.products
    WHERE (v_raw_product_id IS NOT NULL AND id = v_raw_product_id)
       OR (v_raw_product_id IS NOT NULL AND reference = v_raw_product_id)
       OR (v_raw_reference IS NOT NULL AND reference = v_raw_reference)
    LIMIT 1;

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
      v_product.id, -- VÉRITABLE clé primaire de public.products garantie existante
      COALESCE(v_product.reference, v_raw_reference),
      COALESCE(v_item->>'name', v_product.name, 'Dispositif médical'),
      COALESCE(v_item->>'unit', v_product.unit, 'Unité'),
      COALESCE(v_item->>'conditionnement', v_product.conditionnement),
      (v_item->>'quantity')::INT,
      0.00,
      0.00,
      'FCFA'
    );
  END LOOP;

  -- ── ÉTAPE 5 : HISTORIQUE INITIAL DU STATUT ──
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

  -- ── ÉTAPE 6 : MISE À JOUR DU PROFIL CLIENT (DERNIÈRE COMMANDE) ──
  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET last_order_at = NOW(),
        updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  -- ── ÉTAPE 7 : RETOUR DE L'OBJET COMMANDE COMPLET AVEC SES LIGNES ──
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

-- Permissions d'exécution
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB) TO anon, authenticated, service_role;

