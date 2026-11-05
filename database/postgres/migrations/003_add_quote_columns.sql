-- =====================================================================
-- CYM PHARMA — Migration PostgreSQL 003
-- Ajout des colonnes de chiffrage et de calcul de montants
-- Date : 02/11/2026
-- =====================================================================
-- CAUSE RACINE : L'API écrit dans des colonnes qui n'existent pas.
-- Cette migration ajoute les colonnes utilisées par api/index.php:390
-- =====================================================================

BEGIN;

-- Message de confirmation
DO $$
BEGIN
  RAISE NOTICE 'Migration 003 : Ajout des colonnes de chiffrage';
END $$;

-- Ajout des colonnes sur la table orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quoted_by TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subtotal_ht NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00;

-- Ajout des commentaires sur les colonnes
COMMENT ON COLUMN public.orders.quoted_at IS 'Date et heure du chiffrage par l''administrateur';
COMMENT ON COLUMN public.orders.quoted_by IS 'ID de l''administrateur qui a effectué le chiffrage';
COMMENT ON COLUMN public.orders.subtotal_ht IS 'Sous-total HT (somme des lignes avant remise et TVA)';
COMMENT ON COLUMN public.orders.total_amount IS 'Montant total final (HT + TVA - remise)';
COMMENT ON COLUMN public.orders.discount_amount IS 'Montant de la remise appliquée (en FCFA)';
COMMENT ON COLUMN public.orders.vat_amount IS 'Montant de la TVA calculée (en FCFA)';

-- Ajout des index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_orders_quoted_at ON public.orders (quoted_at);
CREATE INDEX IF NOT EXISTS idx_orders_quoted_by ON public.orders (quoted_by);

-- Commentaire sur la colonne priced_at existante (pour cohérence)
COMMENT ON COLUMN public.orders.priced_at IS 'Date de première saisie de prix (legacy, utiliser quoted_at)';

-- Enregistrement de la migration
INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES ('003', 'add_quote_columns', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

-- Rapport : Commandes qui ont un statut "chiffré" mais un montant à 0
DO $$
DECLARE
  nombre_commandes INTEGER;
BEGIN
  SELECT COUNT(*) INTO nombre_commandes
  FROM public.orders
  WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée', 'En attente de devis')
    AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);
  
  RAISE NOTICE 'Commandes marquées chiffrées sans montant (à corriger via migration 004) : %', nombre_commandes;
END $$;

-- Afficher quelques exemples (dans les logs PostgreSQL)
SELECT 
  'Exemple de commande sans montant' AS rapport,
  id, 
  order_number, 
  status, 
  COALESCE(total, 0) AS total_actuel,
  COALESCE(total_amount, 0) AS total_amount_actuel,
  priced_at,
  quoted_at,
  created_at
FROM public.orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL)
ORDER BY created_at DESC
LIMIT 10;

-- Message de succès
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 003 appliquée avec succès';
END $$;

COMMIT;
