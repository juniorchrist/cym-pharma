/**
 * src/services/supabase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client officiel Supabase pour CYM Pharma.
 *
 * RÈGLES DE SÉCURITÉ :
 *  - N'utilise JAMAIS la clé secrète service_role dans le frontend React.
 *  - Utilise uniquement VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY).
 *  - La sécurité des données et la confidentialité des prix/stocks sont garanties
 *    par les politiques RLS (Row Level Security) définies dans supabase/migrations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const SUPABASE_ANON_KEY = (
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  ''
)?.trim();

/**
 * Détermine si Supabase est correctement configuré avec de vrais paramètres
 * (différents des placeholders d'exemple).
 */
export function isSupabaseConfigured(): boolean {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (SUPABASE_URL.includes('your-project') || SUPABASE_URL.includes('example.com')) return false;
  if (SUPABASE_ANON_KEY.includes('your-anon-key') || SUPABASE_ANON_KEY.includes('sb_publishable_placeholder')) return false;
  try {
    const url = new URL(SUPABASE_URL);
    return Boolean(url.protocol.startsWith('http') && SUPABASE_ANON_KEY.length > 20);
  } catch {
    return false;
  }
}

// Initialisation du client Supabase
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'cym_supabase_auth_token',
      },
    })
  : null;

/**
 * Retourne l'instance Supabase active ou lève une exception informative si non configurée.
 */
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase n\'est pas configuré. Veuillez renseigner VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY dans votre fichier .env.'
    );
  }
  return supabase;
}
