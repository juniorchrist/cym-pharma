/**
 * src/config/api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Configuration de l'URL de base de l'API backend PHP.
 *
 * Priorité (la première valeur non-vide gagne) :
 *  1. Variable d'environnement Vite : VITE_API_URL  (build-time)
 *  2. Override runtime via localStorage['cym_api_url']  (admin seulement)
 *  3. Fallback : http://localhost/bon/api  (développement local XAMPP)
 *
 * Pour changer d'environnement, créez un fichier `.env.local` ou
 * `.env.production` avec VITE_API_URL= ... (voir .env.example).
 * Ne codez JAMAIS une URL en dur dans le code source.
 */

const ENV_API_URL = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE_URL: string =
  ENV_API_URL?.trim() || 'http://localhost/bon/api';

/**
 * Résout dynamiquement l'URL de l'API à chaque requête :
 *  1. Vérifie d'abord VITE_API_URL (injecté au moment du build).
 *  2. Vérifie si un override admin est défini dans localStorage['cym_api_url'].
 *  3. Retourne sinon API_BASE_URL.
 */
export function getApiBaseUrl(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const customUrl = window.localStorage.getItem('cym_api_url');
      if (customUrl && typeof customUrl === 'string' && customUrl.trim().length > 0) {
        return customUrl.trim().replace(/\/+$/, '');
      }
    }
  } catch {
    // Accès localStorage bloqué (mode privé strict, etc.)
  }
  return API_BASE_URL;
}
