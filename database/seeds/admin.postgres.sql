-- =====================================================================
-- CYM PHARMA — CRÉATION DU COMPTE ADMINISTRATEUR (Supabase)
-- database/seeds/admin.postgres.sql
-- =====================================================================
-- CE FICHIER NE CONTIENT AUCUN SECRET RÉEL.
-- Procédure recommandée pour créer l'administrateur en production :
--
-- ÉTAPE 1 : Créer le compte via Supabase Auth (Dashboard → Authentication → Users → Add user)
--           Email : votre-email@domaine.com
--           Mot de passe : (choisissez un mot de passe fort, 16+ caractères)
--
-- ÉTAPE 2 : Récupérer l'UUID du compte créé depuis la liste des utilisateurs
--
-- ÉTAPE 3 : Exécuter le SQL ci-dessous dans Supabase SQL Editor
--           en remplaçant 'VOTRE_UUID_ICI' et 'votre-email@domaine.com'
-- =====================================================================

-- Promotion du profil en administrateur
-- Remplacez les valeurs avant d'exécuter.
DO $$
DECLARE
  v_admin_uuid UUID := 'VOTRE_UUID_ICI'::UUID;
  v_admin_email TEXT := 'votre-email@domaine.com';
  v_admin_name TEXT := 'Direction CYM Pharma';
BEGIN
  -- Vérifier que l'UUID existe dans auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_uuid) THEN
    RAISE EXCEPTION 'UUID % introuvable dans auth.users — vérifiez l''UUID', v_admin_uuid;
  END IF;

  -- Insérer ou mettre à jour le profil avec le rôle admin
  INSERT INTO public.profiles (id, email, name, role, status, created_at, updated_at)
  VALUES (v_admin_uuid, v_admin_email, v_admin_name, 'admin', 'active', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    role       = 'admin',
    status     = 'active',
    name       = COALESCE(EXCLUDED.name, public.profiles.name),
    updated_at = NOW();

  RAISE NOTICE 'Administrateur % (%) configuré avec succès.', v_admin_name, v_admin_email;
END $$;

-- Vérification
SELECT id, email, name, role, status FROM public.profiles WHERE role = 'admin';
