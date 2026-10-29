/**
 * src/utils/phone.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Normalisation et validation stricte des numéros de téléphone pour la Côte d'Ivoire (+225).
 * Plan national à 10 chiffres (en vigueur depuis le 31 janvier 2021).
 *
 * Format WhatsApp attendu pour wa.me : "225" + 10 chiffres (13 chiffres au total).
 * Exemple : 2250707079746
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface PhoneValidationResult {
  isValid: boolean;
  /** Numéro normalisé pour wa.me (ex: "2250707079746") ou null si invalide */
  normalized: string | null;
  /** Format d'affichage lisible (ex: "+225 07 07 07 97 46") ou brut */
  formatted: string;
  /** Message d'erreur explicite pour l'utilisateur */
  error?: string;
}

/**
 * Nettoie et normalise un numéro de téléphone ivoirien.
 *
 * Cas gérés :
 *  - "+225 07 07 07 97 46"  → "2250707079746"
 *  - "00225 0707 0797 46"   → "2250707079746"
 *  - "07 07 07 97 46"       → "2250707079746"
 *  - "0707079746"           → "2250707079746"
 *  - "2250707079746"        → "2250707079746"
 *  - "70707974" (8 chiffres) → Rejeté (ancien format, opérateur indéterminé)
 */
export function normalizeIvorianPhone(rawPhone?: string | null): PhoneValidationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      isValid: false,
      normalized: null,
      formatted: '',
      error: 'Numéro de téléphone non renseigné.',
    };
  }

  // 1. Supprimer espaces, tirets, points, parenthèses, barres
  let cleaned = rawPhone.trim().replace(/[\s\-\.\(\)\/]/g, '');

  if (!cleaned) {
    return {
      isValid: false,
      normalized: null,
      formatted: rawPhone.trim(),
      error: 'Numéro de téléphone vide.',
    };
  }

  // 2. Traiter le préfixe international
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // Vérifier si seuls des chiffres restent
  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      normalized: null,
      formatted: rawPhone.trim(),
      error: 'Le numéro contient des caractères non numériques invalides.',
    };
  }

  // 3. Détecter l'ancien format à 8 chiffres (ex: 70707974 ou 22570707974)
  if (cleaned.length === 8 || (cleaned.startsWith('225') && cleaned.length === 11)) {
    return {
      isValid: false,
      normalized: null,
      formatted: rawPhone.trim(),
      error:
        'Ancien numéro à 8 chiffres détecté : le préfixe opérateur à 10 chiffres (01, 05 ou 07) ne peut être deviné. Veuillez corriger le numéro.',
    };
  }

  // 4. Analyser la longueur et le préfixe
  let tenDigitNational = '';

  if (cleaned.startsWith('225')) {
    // Cas "225" suivi du numéro national
    const rest = cleaned.substring(3);
    if (rest.length === 10) {
      tenDigitNational = rest;
    } else {
      return {
        isValid: false,
        normalized: null,
        formatted: rawPhone.trim(),
        error: `Numéro incomplet après l'indicatif 225 (${rest.length} chiffres au lieu de 10).`,
      };
    }
  } else if (cleaned.length === 10) {
    // Cas national standard à 10 chiffres (doit débuter par 0)
    if (!cleaned.startsWith('0')) {
      return {
        isValid: false,
        normalized: null,
        formatted: rawPhone.trim(),
        error: 'Un numéro national ivoirien à 10 chiffres doit débuter par 0 (ex: 07, 05, 01).',
      };
    }
    tenDigitNational = cleaned;
  } else {
    return {
      isValid: false,
      normalized: null,
      formatted: rawPhone.trim(),
      error: `Longueur invalide (${cleaned.length} chiffres). Format attendu : 10 chiffres ou +225 suivi de 10 chiffres.`,
    };
  }

  const normalized = `225${tenDigitNational}`;
  // Formater joliment : "+225 XX XX XX XX XX"
  const formatted = `+225 ${tenDigitNational.slice(0, 2)} ${tenDigitNational.slice(2, 4)} ${tenDigitNational.slice(4, 6)} ${tenDigitNational.slice(6, 8)} ${tenDigitNational.slice(8, 10)}`;

  return {
    isValid: true,
    normalized,
    formatted,
  };
}

/**
 * Construit l'URL WhatsApp wa.me avec encodage strict et limite de sécurité.
 */
export function buildWhatsAppLink(phone: string, text: string): string {
  const norm = normalizeIvorianPhone(phone);
  if (!norm.isValid || !norm.normalized) {
    throw new Error(norm.error || 'Numéro invalide pour WhatsApp');
  }

  // Tronquer proprement à ~1000 caractères
  const safeText = text.length > 1000 ? text.slice(0, 1000) : text;
  return `https://wa.me/${norm.normalized}?text=${encodeURIComponent(safeText)}`;
}
