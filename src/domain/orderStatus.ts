/**
 * src/domain/orderStatus.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Source unique de vérité pour les statuts de commande CYM Pharma.
 * Utilisé par l'admin ET le client. Toute modification doit être répercutée
 * dans la contrainte CHECK PostgreSQL (migration SQL) et MySQL (api/index.php).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Code machine du statut — jamais renommé sans migration SQL. */
export type OrderStatusCode =
  | 'pending_quote'   // Reçue, en attente de chiffrage par l'admin
  | 'quoted'          // Chiffrée par l'admin, montant transmis au client
  | 'confirmed'       // Confirmée (devis accepté)
  | 'in_preparation'  // En cours de préparation
  | 'shipped'         // Expédiée
  | 'delivered'       // Livrée
  | 'cancelled';      // Annulée

/** Transitions autorisées entre statuts.
 * Règle d'or : le chiffrage par l'administrateur vaut confirmation de la commande.
 * Une commande chiffrée passe donc directement à la préparation ou à l'expédition.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatusCode, OrderStatusCode[]> = {
  pending_quote:  ['quoted', 'cancelled'],
  quoted:         ['in_preparation', 'confirmed', 'shipped', 'cancelled'],
  confirmed:      ['in_preparation', 'cancelled'],
  in_preparation: ['shipped', 'cancelled'],
  shipped:        ['delivered', 'cancelled'],
  delivered:      [],
  cancelled:      [],
};

export interface OrderStatusInfo {
  code: OrderStatusCode;
  /** Libellé affiché côté admin */
  adminLabel: string;
  /** Libellé affiché côté client */
  clientLabel: string;
  /** Classe CSS Tailwind pour la couleur de fond du badge (status-pill-*) */
  pillClass: 'status-pill-amber' | 'status-pill-green' | 'status-pill-blue' | 'status-pill-gray' | 'status-pill-red';
  /** true si la commande a un montant définitif */
  hasAmount: boolean;
}

export const ORDER_STATUSES: Record<OrderStatusCode, OrderStatusInfo> = {
  pending_quote: {
    code: 'pending_quote',
    adminLabel: 'À chiffrer',
    clientLabel: 'En attente de chiffrage',
    pillClass: 'status-pill-amber',
    hasAmount: false,
  },
  quoted: {
    code: 'quoted',
    adminLabel: 'Confirmée (Chiffrée)',
    clientLabel: 'Confirmée — Chiffrée',
    pillClass: 'status-pill-green',
    hasAmount: true,
  },
  confirmed: {
    code: 'confirmed',
    adminLabel: 'Confirmée',
    clientLabel: 'Confirmée',
    pillClass: 'status-pill-blue',
    hasAmount: true,
  },
  in_preparation: {
    code: 'in_preparation',
    adminLabel: 'En préparation',
    clientLabel: 'En cours de préparation',
    pillClass: 'status-pill-blue',
    hasAmount: true,
  },
  shipped: {
    code: 'shipped',
    adminLabel: 'Expédiée',
    clientLabel: 'Expédiée',
    pillClass: 'status-pill-blue',
    hasAmount: true,
  },
  delivered: {
    code: 'delivered',
    adminLabel: 'Livrée',
    clientLabel: 'Livrée',
    pillClass: 'status-pill-green',
    hasAmount: true,
  },
  cancelled: {
    code: 'cancelled',
    adminLabel: 'Annulée',
    clientLabel: 'Annulée',
    pillClass: 'status-pill-red',
    hasAmount: false,
  },
};

/**
 * Normalise un statut venant de la base de données (anciens libellés français
 * ou codes anglais) vers le code machine standard.
 *
 * Supporte les valeurs héritées : 'En attente de devis', 'Chiffrée', 'pending', etc.
 * Ne lève pas d'erreur sur une valeur inconnue : retourne 'pending_quote' par défaut.
 */
export function normalizeOrderStatus(raw: string | null | undefined): OrderStatusCode {
  if (!raw) return 'pending_quote';

  const s = raw.trim().toLowerCase();

  // Codes machine modernes
  if (s === 'pending_quote' || s === 'pending') return 'pending_quote';
  if (s === 'quoted') return 'quoted';
  if (s === 'confirmed') return 'confirmed';
  if (s === 'in_preparation' || s === 'preparation') return 'in_preparation';
  if (s === 'shipped') return 'shipped';
  if (s === 'delivered' || s === 'livrée' || s === 'livree') return 'delivered';
  if (s === 'cancelled' || s === 'annulée' || s === 'annulee') return 'cancelled';

  // Chiffrée / Devis envoyé (statuts tarifés)
  if (s.includes('devis envoyé') || s.includes('devis envoye') || s.includes('envoyé') || s.includes('envoye')) return 'quoted';
  if (s.includes('chiffrée') || s.includes('chiffree')) return 'quoted';

  // En attente de chiffrage / devis
  if (s.includes('attente') || s.includes('chiffrer') || s.includes('demande')) return 'pending_quote';
  if (s.includes('devis')) return 'pending_quote';

  if (s === 'confirmed' || s.includes('confirmée') || s.includes('confirmee')) return 'confirmed';
  if (s.includes('préparation') || s.includes('preparation')) return 'in_preparation';
  if (s.includes('expédiée') || s.includes('expediee')) return 'shipped';

  return 'pending_quote';
}

/**
 * Retourne les infos d'un statut depuis une valeur brute de base de données.
 */
export function getOrderStatus(raw: string | null | undefined): OrderStatusInfo {
  const code = normalizeOrderStatus(raw);
  return ORDER_STATUSES[code];
}

/**
 * Vérifie si une commande est "à chiffrer" (aucun montant transmis).
 */
export function isPendingQuote(raw: string | null | undefined): boolean {
  return normalizeOrderStatus(raw) === 'pending_quote';
}

/**
 * Vérifie si une commande est chiffrée (montant disponible).
 */
export function isQuoted(raw: string | null | undefined): boolean {
  const code = normalizeOrderStatus(raw);
  return ORDER_STATUSES[code].hasAmount;
}
