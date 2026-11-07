-- =============================================================================
-- CYM PHARMA — MIGRATION 004 : CORRECTION HISTORIQUE DES COMMANDES SANS PRIX
-- & CONTRAINTE CHECK DE COHÉRENCE STRICTE
-- =============================================================================
-- Règle d'or : Toute commande postérieure à pending_quote (hors cancelled)
-- doit obligatoirement posséder un total strictement supérieur à 0 FCFA.
-- =============================================================================

BEGIN;

-- 1. Enregistrement d'une ligne d'audit dans order_status_history par commande concernée
INSERT INTO order_status_history (order_id, status, note, changed_by, created_at)
SELECT 
    id, 
    'pending_quote', 
    'Réinitialisation de cohérence : commande postérieure à pending_quote sans montant ramenée à chiffrer', 
    NULL, 
    NOW()
FROM orders
WHERE status NOT IN ('pending_quote', 'pending', 'En attente de chiffrage', 'cancelled', 'Annulée')
  AND COALESCE(total, 0) <= 0;

-- 2. Remise au statut pending_quote et réinitialisation de la facture
UPDATE orders
SET 
    status = 'pending_quote',
    invoice_number = NULL,
    invoice_date = NULL,
    priced_at = NULL,
    updated_at = NOW()
WHERE status NOT IN ('pending_quote', 'pending', 'En attente de chiffrage', 'cancelled', 'Annulée')
  AND COALESCE(total, 0) <= 0;

-- 3. Ajout de la contrainte CHECK en NOT VALID (n'interrompt pas les écritures existantes)
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS chk_orders_positive_total_when_quoted;

ALTER TABLE orders
ADD CONSTRAINT chk_orders_positive_total_when_quoted
CHECK (
    status IN ('pending_quote', 'pending', 'En attente de chiffrage', 'cancelled', 'Annulée')
    OR (COALESCE(total, 0) > 0)
) NOT VALID;

-- 4. Validation de la contrainte une fois les données assainies
ALTER TABLE orders
VALIDATE CONSTRAINT chk_orders_positive_total_when_quoted;

COMMIT;
