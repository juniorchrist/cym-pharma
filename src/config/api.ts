/**
 * src/config/api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Configuration unique de l'URL de base de l'API backend Express.
 *
 * Règle d'or :
 *  - En production (build production), VITE_API_URL est obligatoire (échec explicite si absent).
 *  - En dev et preview locaux, les requêtes passent par le proxy Vite `/api` vers server.js.
 */

const rawEnvApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

if (import.meta.env.PROD && (!rawEnvApi || rawEnvApi.length === 0)) {
  throw new Error('[CYM FATAL] La variable d\'environnement VITE_API_URL est obligatoire en build production.');
}

export const API_BASE_URL: string = (rawEnvApi || '/api').replace(/\/+$/, '');

export function getApiBaseUrl(): string {
  if (import.meta.env.PROD) {
    return API_BASE_URL;
  }

  const isLocalhost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (isLocalhost) {
    try {
      const customUrl = window.localStorage?.getItem('cym_api_url');
      if (customUrl && typeof customUrl === 'string' && customUrl.trim().length > 0) {
        return customUrl.trim().replace(/\/+$/, '');
      }
    } catch {}

    return rawEnvApi || '/api';
  }

  return API_BASE_URL;
}

export function buildApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  const base = getApiBaseUrl().replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  if (base.endsWith('/api') && cleanEndpoint.startsWith('/api/')) {
    return `${base}${cleanEndpoint.slice(4)}`;
  }
  if (base.endsWith('/api') && cleanEndpoint === '/api') {
    return base;
  }
  if (!base.endsWith('/api') && !cleanEndpoint.startsWith('/api/')) {
    return `${base}/api${cleanEndpoint}`;
  }

  return `${base}${cleanEndpoint}`;
}
