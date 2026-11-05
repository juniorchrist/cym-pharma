-- =====================================================================
-- CYM PHARMA — Migration MySQL 003
-- Ajout des colonnes de chiffrage et de calcul de montants
-- Date : 02/11/2026
-- =====================================================================
-- CAUSE RACINE : L'API écrit dans des colonnes qui n'existent pas.
-- Cette migration ajoute les colonnes utilisées par api/index.php:390
-- =====================================================================

-- Vérifier que la migration n'a pas déjà été appliquée
SELECT 'Migration 003 : Ajout des colonnes de chiffrage' AS message;

-- Ajout des colonnes sur la table orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS quoted_at DATETIME DEFAULT NULL COMMENT 'Date et heure du chiffrage par l\'administrateur',
  ADD COLUMN IF NOT EXISTS quoted_by VARCHAR(64) DEFAULT NULL COMMENT 'ID de l\'administrateur qui a effectué le chiffrage',
  ADD COLUMN IF NOT EXISTS subtotal_ht DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Sous-total HT (somme des lignes avant remise et TVA)',
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Montant total final (HT + TVA - remise)',
  ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Montant de la remise appliquée (en FCFA)',
  ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 COMMENT 'Montant de la TVA calculée (en FCFA)';

-- Ajout des index pour améliorer les performances des requêtes
ALTER TABLE orders
  ADD INDEX IF NOT EXISTS idx_orders_quoted_at (quoted_at),
  ADD INDEX IF NOT EXISTS idx_orders_quoted_by (quoted_by);

-- Commentaire sur la colonne priced_at existante (pour cohérence)
ALTER TABLE orders
  MODIFY COLUMN priced_at DATETIME DEFAULT NULL COMMENT 'Date de première saisie de prix (legacy, utiliser quoted_at)';

-- Enregistrement de la migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('003', 'add_quote_columns', NOW())
ON DUPLICATE KEY UPDATE applied_at = NOW();

-- Rapport : Commandes qui ont un statut "chiffré" mais un montant à 0
SELECT 
  'Commandes marquées chiffrées sans montant (à corriger via migration 004)' AS rapport,
  COUNT(*) AS nombre_de_commandes
FROM orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée', 'En attente de devis')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL);

-- Afficher quelques exemples
SELECT 
  id, 
  order_number, 
  status, 
  COALESCE(total, 0) AS total_actuel,
  COALESCE(total_amount, 0) AS total_amount_actuel,
  priced_at,
  quoted_at,
  created_at
FROM orders
WHERE status IN ('quoted', 'Chiffrée', 'confirmed', 'Confirmée')
  AND (total <= 0 OR total IS NULL OR total_amount <= 0 OR total_amount IS NULL)
ORDER BY created_at DESC
LIMIT 10;

SELECT '✅ Migration 003 appliquée avec succès' AS statut;
