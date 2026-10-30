/**
 * src/config/api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Configuration de l'URL de base de l'API backend Express hébergée sur Render.
 *
 * Configuration attendue en production :
 *   VITE_API_URL=https://cym-pharma.onrender.com/api
 */

const DEFAULT_PROD_API_URL = 'https://cym-pharma.onrender.com/api';

const ENV_API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

export const API_BASE_URL: string = (ENV_API_URL || DEFAULT_PROD_API_URL).replace(/\/+$/, '');

/**
 * Résout dynamiquement l'URL de base de l'API à chaque requête :
 *  - En production (build production ou domaine distant comme infinityfreeapp.com) :
 *    Utilise TOUJOURS l'URL officielle configurée (aucun override localStorage permis).
 *  - En développement local strict (localhost / 127.0.0.1) :
 *    Permet si nécessaire un override local.
 */
export function getApiBaseUrl(): string {
  const isLocalhost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  // En production ou sur un domaine hébergé : URL officielle stricte
  if (import.meta.env.PROD || !isLocalhost) {
    return API_BASE_URL;
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const customUrl = window.localStorage.getItem('cym_api_url');
      if (customUrl && typeof customUrl === 'string' && customUrl.trim().length > 0) {
        return customUrl.trim().replace(/\/+$/, '');
      }
    }
  } catch {
    // Mode privé strict
  }

  return API_BASE_URL;
}

/**
 * Construit une URL propre sans jamais doubler le segment /api :
 * ex: buildApiUrl('/api/health') => 'https://cym-pharma.onrender.com/api/health'
 * ex: buildApiUrl('/health')     => 'https://cym-pharma.onrender.com/api/health'
 * ex: buildApiUrl('/orders')     => 'https://cym-pharma.onrender.com/api/orders'
 */
export function buildApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  const base = getApiBaseUrl().replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Si la base se termine déjà par /api et que l'endpoint commence par /api/
  if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
    return `${base}${cleanEndpoint.slice(4)}`;
  }

  // Si l'endpoint est exactement '/api'
  if (base.endsWith('/api') && cleanEndpoint === '/api') {
    return base;
  }

  // Si la base ne se termine PAS par /api et que l'endpoint ne commence PAS par /api/
  if (!base.endsWith('/api') && !cleanEndpoint.startsWith('/api/')) {
    return `${base}/api${cleanEndpoint}`;
  }

  return `${base}${cleanEndpoint}`;
}
