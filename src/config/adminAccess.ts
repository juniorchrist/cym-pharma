/**
 * src/config/adminAccess.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sécurité et contrôle d'accès administrateur CYM Pharma.
 *
 * RÈGLES DE SÉCURITÉ ABSOLUES :
 *  - AUCUN mot de passe administrateur n'est codé en dur dans le frontend.
 *  - L'accès administrateur est STRICTEMENT subordonné à l'authentification
 *    d'un compte avec le rôle 'admin' vérifié par Supabase Auth ou le serveur.
 */

import { User } from '../types';

/**
 * Vérifie si un utilisateur possède les privilèges administrateur légitimes.
 */
export function hasAdminRole(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' && user.status === 'active';
}
