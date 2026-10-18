/**
 * Configuration de l'URL de base de l'API.
 * L'application ne requiert aucune variable d'environnement pour fonctionner.
 * L'URL par défaut pointe vers le backend PHP local (http://localhost/bon/api).
 * Elle peut être surchargée sans toucher au code via localStorage['cym_api_url'].
 */

export const API_BASE_URL = 'http://localhost/bon/api';

/**
 * Résout dynamiquement l'URL de l'API à chaque requête :
 * 1. Vérifie si une URL personnalisée est définie dans localStorage['cym_api_url']
 * 2. Retourne sinon l'URL par défaut API_BASE_URL
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
    // Évite tout blocage en cas d'accès restreint au localStorage
  }
  return API_BASE_URL;
}
