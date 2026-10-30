-- =====================================================================
-- CYM PHARMA - MIGRATION 20261031000001 : SYNCHRONISATION PROFILS & COMMANDES
-- =====================================================================
-- 1. Amélioration du trigger handle_new_user pour enregistrer establishment_name et phone
-- 2. Rattrapage de tous les utilisateurs auth.users sans profil
-- 3. Clé étrangère formelle orders.user_id -> public.profiles(id)
-- 4. Droits d'exécution RPC create_order_atomic
-- =====================================================================

-- 1. Trigger handle_new_user complet
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    first_name,
    last_name,
    role,
    establishment_name,
    phone,
    status
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    NEW.raw_user_meta_data->>'establishment_name',
    NEW.raw_user_meta_data->>'phone',
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.profiles.name),
    first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, public.profiles.last_name),
    establishment_name = COALESCE(EXCLUDED.establishment_name, public.profiles.establishment_name),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- S'assurer que le trigger est attaché
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Rattrapage des profils manquants pour les comptes existants
INSERT INTO public.profiles (
  id,
  email,
  name,
  first_name,
  last_name,
  role,
  establishment_name,
  phone,
  status
)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'name', u.email),
  u.raw_user_meta_data->>'first_name',
  u.raw_user_meta_data->>'last_name',
  COALESCE(u.raw_user_meta_data->>'role', 'client'),
  u.raw_user_meta_data->>'establishment_name',
  u.raw_user_meta_data->>'phone',
  'active'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Clé étrangère formelle orders -> profiles pour que PostgREST reconnaisse la relation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_orders_user_profiles'
      AND table_name = 'orders'
      AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_user_profiles
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Notice: Foreign key creation note: %', SQLERRM;
END $$;

-- 4. Grants pour create_order_atomic
GRANT EXECUTE ON FUNCTION public.create_order_atomic(JSONB, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
