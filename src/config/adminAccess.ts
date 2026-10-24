/**
 * src/config/adminAccess.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sécurité et contrôle d'accès administrateur CYM Pharma.
 *
 * RÈGLE DE SÉCURITÉ ABSOLUE :
 *  - AUCUN mot de passe administrateur ne doit être codé en dur dans le frontend.
 *  - L'accès administrateur est STRICTEMENT subordonné à l'authentification
 *    d'un compte avec le rôle 'admin' validé par Supabase ou le backend.
 */

import { User } from '../types';

/**
 * Vérifie si un utilisateur possède les privilèges administrateur légitimes.
 */
export function hasAdminRole(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' && user.status === 'active';
}

/**
 * Fonction de vérification conservée pour la compatibilité d'interface :
 * Refuse systématiquement tout mot de passe en dur côté client.
 * L'accès doit obligatoirement transiter par l'authentification réelle.
 */
export function verifyAdminPassword(_password: string): boolean {
  // Aucun mot de passe codé en dur n'est autorisé.
  return false;
}
