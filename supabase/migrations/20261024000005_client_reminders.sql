-- =====================================================================
-- CYM PHARMA — MIGRATION 005 : RELANCES MANUELLES WHATSAPP & MODÈLES B2B
-- supabase/migrations/20261024000005_client_reminders.sql
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Ajout de last_reminder_at sur public.profiles
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_reminder ON public.profiles(last_reminder_at);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Table des modèles officiels de relance (texte brut, sans emoji)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reminder_templates (
  template_key  VARCHAR(64) PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  content       TEXT NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  warning_note  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Amorçage des 4 modèles officiels sans emoji
INSERT INTO public.reminder_templates (template_key, title, content, is_default, warning_note)
VALUES
  (
    'reprise_contact',
    'Reprise de contact',
    'Bonjour {responsable}, c''est CYM Pharma. Nous n''avons pas reçu de commande de {structure} depuis un moment. Avez-vous un besoin à nous confier ? Nous restons disponibles.',
    TRUE,
    NULL
  ),
  (
    'reappro',
    'Réapprovisionnement',
    'Bonjour {responsable}, c''est CYM Pharma. Souhaitez-vous que nous préparions un réapprovisionnement pour {structure} ? Dites-nous vos références.',
    FALSE,
    NULL
  ),
  (
    'espace_client',
    'Votre espace client',
    'Bonjour {responsable}, c''est CYM Pharma. Votre espace client vous permet de commander et de suivre vos livraisons à tout moment. Besoin d''aide pour vous connecter ?',
    FALSE,
    NULL
  ),
  (
    'nouveautes',
    'Nouveautés',
    'Bonjour {responsable}, c''est CYM Pharma. De nouvelles références sont disponibles dans notre catalogue. Souhaitez-vous que nous vous les présentions ?',
    FALSE,
    'Ne doit être utilisé que si de nouvelles références réelles ont été récemment ajoutées au catalogue.'
  )
ON CONFLICT (template_key) DO UPDATE
SET
  title        = EXCLUDED.title,
  content      = EXCLUDED.content,
  is_default   = EXCLUDED.is_default,
  warning_note = EXCLUDED.warning_note;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Table des relances manuelles WhatsApp (traçabilité réelle)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel       VARCHAR(32) NOT NULL DEFAULT 'whatsapp_manuel',
  template_key  VARCHAR(64) NOT NULL REFERENCES public.reminder_templates(template_key),
  opened_by     UUID NOT NULL REFERENCES public.profiles(id),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at  TIMESTAMPTZ,
  status        VARCHAR(20) NOT NULL DEFAULT 'opened' CHECK (status IN ('opened', 'confirmed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_reminders_user_id ON public.client_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_client_reminders_status ON public.client_reminders(status);
CREATE INDEX IF NOT EXISTS idx_client_reminders_opened_at ON public.client_reminders(opened_at DESC);

-- Trigger : mise à jour de last_reminder_at lors de la confirmation
CREATE OR REPLACE FUNCTION public.handle_reminder_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    NEW.confirmed_at = COALESCE(NEW.confirmed_at, NOW());
    UPDATE public.profiles
    SET last_reminder_at = NEW.confirmed_at
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_client_reminder_confirmed ON public.client_reminders;
CREATE TRIGGER on_client_reminder_confirmed
  BEFORE UPDATE ON public.client_reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_reminder_confirmation();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Politiques RLS (Row Level Security)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.reminder_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_reminders ENABLE ROW LEVEL SECURITY;

-- reminder_templates : lecture par tout utilisateur authentifié, écriture admin uniquement
DROP POLICY IF EXISTS "reminder_templates_read" ON public.reminder_templates;
CREATE POLICY "reminder_templates_read"
  ON public.reminder_templates
  FOR SELECT
  TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "reminder_templates_admin_write" ON public.reminder_templates;
CREATE POLICY "reminder_templates_admin_write"
  ON public.reminder_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- client_reminders : accès réservé aux administrateurs
DROP POLICY IF EXISTS "client_reminders_admin_all" ON public.client_reminders;
CREATE POLICY "client_reminders_admin_all"
  ON public.client_reminders
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
