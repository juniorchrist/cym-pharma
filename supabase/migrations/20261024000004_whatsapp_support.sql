-- =====================================================================
-- CYM PHARMA — MIGRATION 004 : SUPPORT WHATSAPP BUSINESS CLOUD API
-- supabase/migrations/20261024000004_whatsapp_support.sql
-- =====================================================================
-- Ajoute les colonnes nécessaires à relance_logs et profiles
-- pour le suivi réel des envois WhatsApp Business Cloud API.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. relance_logs — colonnes WhatsApp
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.relance_logs
  ADD COLUMN IF NOT EXISTS whatsapp_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_direct_url  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_status       TEXT CHECK (whatsapp_status IN ('sent', 'delivered', 'read', 'failed', 'pending'));

CREATE INDEX IF NOT EXISTS idx_relance_wa_status ON public.relance_logs(whatsapp_status);

-- ─────────────────────────────────────────────────────────────────────
-- 2. profiles — champs de suivi relance
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS relance_count         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_relance_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_relance_channel   TEXT CHECK (last_relance_channel IN ('whatsapp', 'email', 'multichannel')),
  ADD COLUMN IF NOT EXISTS last_relance_status    TEXT CHECK (last_relance_status IN ('sent', 'delivered', 'failed', 'pending'));

CREATE INDEX IF NOT EXISTS idx_profiles_last_relance ON public.profiles(last_relance_at);

-- ─────────────────────────────────────────────────────────────────────
-- 3. Vue calculée : clients inactifs avec métriques de relance
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_inactive_clients AS
SELECT
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  p.establishment_name,
  p.commune,
  p.status,
  p.last_order_at,
  p.last_relance_at,
  p.last_relance_channel,
  p.last_relance_status,
  p.relance_count,
  EXTRACT(DAY FROM NOW() - p.last_order_at)::INTEGER  AS days_since_last_order,
  COUNT(o.id)                                          AS total_orders,
  COALESCE(SUM(o.total_amount), 0)                     AS total_spent
FROM public.profiles p
LEFT JOIN public.orders o ON o.user_id = p.id::text
WHERE
  p.role = 'client'
  AND (
    p.last_order_at IS NULL
    OR p.last_order_at < NOW() - INTERVAL '60 days'
  )
GROUP BY
  p.id, p.email, p.first_name, p.last_name, p.phone,
  p.establishment_name, p.commune, p.status,
  p.last_order_at, p.last_relance_at, p.last_relance_channel,
  p.last_relance_status, p.relance_count;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Fonction Supabase : vérification automatique de l'inactivité
--    Appelée par pg_cron toutes les nuits à 02h00 (Abidjan, UTC+0)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_inactive_clients()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count INTEGER := 0;
  cutoff_date   TIMESTAMPTZ := NOW() - INTERVAL '60 days';
BEGIN
  WITH updated AS (
    UPDATE public.profiles
    SET
      status     = 'inactive',
      updated_at = NOW()
    WHERE
      role = 'client'
      AND status = 'active'
      AND (last_order_at IS NULL OR last_order_at < cutoff_date)
    RETURNING id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;

  RETURN jsonb_build_object(
    'success', TRUE,
    'newly_inactive', updated_count,
    'checked_at', NOW()
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. Politiques RLS pour relance_logs
-- (les admins voient tout, les clients ne voient rien)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.relance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_full_relance_logs" ON public.relance_logs;
CREATE POLICY "admin_full_relance_logs"
  ON public.relance_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 6. Commentaires métier
-- ─────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.relance_logs IS
  'Journal certifié de toutes les relances B2B envoyées aux clients inactifs via WhatsApp Business Cloud API et/ou Email.';

COMMENT ON COLUMN public.relance_logs.status IS
  'Statut de la tentative d''envoi : sent = API a confirmé, failed = API a échoué, pending = non configuré.';

COMMENT ON COLUMN public.relance_logs.whatsapp_message_id IS
  'ID retourné par la WhatsApp Cloud API lors d''un envoi réussi (format wamid.*).';

COMMENT ON COLUMN public.relance_logs.whatsapp_direct_url IS
  'Lien wa.me/ de secours avec le message pré-rempli, généré même en cas d''échec API.';
