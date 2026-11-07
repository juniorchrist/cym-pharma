-- =============================================================================
-- CYM PHARMA — MIGRATION 004 : CORRECTION HISTORIQUE DES COMMANDES SANS PRIX
-- Base cible : PostgreSQL / Supabase
-- Correction : order_status_history utilise changed_at (pas created_at).
-- =============================================================================

BEGIN;

-- 1. Enregistrer le changement d'historique pour les commandes incohérentes.
-- changed_at est omis : sa valeur par défaut NOW() est appliquée par PostgreSQL.
INSERT INTO public.order_status_history (
    order_id,
    status,
    note,
    changed_by
)
SELECT
    o.id,
    'pending_quote',
    'Réinitialisation de cohérence : commande sans montant ramenée à chiffrer',
    NULL
FROM public.orders AS o
WHERE o.status NOT IN (
    'pending_quote',
    'pending',
    'En attente de chiffrage',
    'cancelled',
    'Annulée'
)
AND COALESCE(o.total, 0) <= 0;

-- 2. Réinitialiser uniquement les commandes non annulées sans montant.
UPDATE public.orders
SET
    status = 'pending_quote',
    invoice_number = NULL,
    invoice_date = NULL,
    priced_at = NULL,
    updated_at = NOW()
WHERE status NOT IN (
    'pending_quote',
    'pending',
    'En attente de chiffrage',
    'cancelled',
    'Annulée'
)
AND COALESCE(total, 0) <= 0;

-- 3. Remplacer la contrainte de cohérence.
ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS chk_orders_positive_total_when_quoted;

ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_positive_total_when_quoted
    CHECK (
        status IN (
            'pending_quote',
            'pending',
            'En attente de chiffrage',
            'cancelled',
            'Annulée'
        )
        OR COALESCE(total, 0) > 0
    ) NOT VALID;

-- 4. Vérifier la contrainte sur toutes les lignes existantes.
ALTER TABLE public.orders
    VALIDATE CONSTRAINT chk_orders_positive_total_when_quoted;

COMMIT;
