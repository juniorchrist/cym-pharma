-- =====================================================================
-- CYM PHARMA — Migration 004 (Multi-DB)
-- Correction des commandes marquées chiffrées sans montant
-- Date : 02/11/2026
-- =====================================================================
-- ⚠️  ATTENTION : Cette migration doit être exécutée MANUELLEMENT
-- après validation de la liste des commandes concernées.
-- 
-- NE PAS EXÉCUTER automatiquement en production sans accord.
-- =====================================================================

-- ═════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 : RAPPORT DES COMMANDES CONCERNÉES
-- ═════════════════════════════════════════════════════════════════════

-- MySQL
/*
SELECT 
  id, 
  order_number, 
  status, 
  COALESCE(total, 0) AS total,
  COALESCE(total_amount, 0) AS total_amount,
  priced_at,
  quoted_at,
  created_at,
  updated_at
FROM orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL)
ORDER BY created_at DESC;
*/

-- PostgreSQL
/*
SELECT 
  id, 
  order_number, 
  status, 
  COALESCE(total, 0) AS total,
  COALESCE(total_amount, 0) AS total_amount,
  priced_at,
  quoted_at,
  created_at,
  updated_at
FROM public.orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL)
ORDER BY created_at DESC;
*/

-- ═════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 : CORRECTION (à décommenter après validation)
-- ═════════════════════════════════════════════════════════════════════

-- MySQL
/*
UPDATE orders
SET 
  status = 'pending_quote',
  priced_at = NULL,
  quoted_at = NULL,
  quoted_by = NULL,
  invoice_number = NULL,
  invoice_date = NULL,
  updated_at = NOW()
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);

-- Enregistrer la migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('004', 'fix_quoted_without_amount', NOW())
ON DUPLICATE KEY UPDATE applied_at = NOW();
*/

-- PostgreSQL
/*
BEGIN;

UPDATE public.orders
SET 
  status = 'pending_quote',
  priced_at = NULL,
  quoted_at = NULL,
  quoted_by = NULL,
  invoice_number = NULL,
  invoice_date = NULL,
  updated_at = NOW()
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);

-- Enregistrer la migration
INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES ('004', 'fix_quoted_without_amount', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
*/

-- ═════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 : VÉRIFICATION POST-CORRECTION
-- ═════════════════════════════════════════════════════════════════════

-- MySQL
/*
SELECT 
  'Commandes restantes avec status chiffré mais montant 0' AS verif,
  COUNT(*) AS nombre
FROM orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);
*/

-- PostgreSQL
/*
SELECT 
  'Commandes restantes avec status chiffré mais montant 0' AS verif,
  COUNT(*) AS nombre
FROM public.orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);
*/
