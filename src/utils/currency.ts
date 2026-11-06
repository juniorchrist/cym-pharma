/**
 * Port of currency.js
 * Formats a numeric value into FCFA currency string.
 * Example: 13000 -> "13 000 FCFA"
 * Invalid or zero values return "0 FCFA"
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') {
    return '0 FCFA';
  }

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(num)) {
    return '0 FCFA';
  }

  const rounded = Math.round(num);

  // Format with French space thousand separators (e.g. "13 000")
  const formatted = rounded
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  return `${formatted} FCFA`;
}

/**
 * Affiche un montant en FCFA en distinguant rigoureusement :
 * - valeur absente (null/undefined/'') → « À chiffrer » ou fallback configuré
 * - commande non chiffrée (statut pending_quote) → « À chiffrer »
 * - valeur invalide (NaN) → « Montant indisponible » avec erreur console
 * - valeur réelle de 0 FCFA → « 0 FCFA »
 * - montant chiffré positif → formaté avec séparateurs d'espaces (« 125 000 FCFA »)
 */
export function formatMoney(
  amount: number | string | null | undefined,
  options: {
    status?: string | null;
    whenAbsent?: string;
    whenZero?: string;
    whenInvalid?: string;
  } = {}
): string {
  const {
    status,
    whenAbsent = 'À chiffrer',
    whenZero = '0 FCFA',
    whenInvalid = 'Montant indisponible',
  } = options;

  // Si le statut de commande indique explicitement une attente de chiffrage
  if (status && (status === 'pending_quote' || status === 'pending' || status.includes('attente') || status.includes('chiffrer'))) {
    return whenAbsent;
  }

  if (amount === null || amount === undefined || amount === '') {
    return whenAbsent;
  }

  const num = typeof amount === 'number'
    ? amount
    : parseFloat(String(amount).replace(/\s/g, '').replace(',', '.'));

  if (isNaN(num)) {
    console.error('[formatMoney] Montant numérique invalide :', amount);
    return whenInvalid;
  }

  if (num === 0) {
    if (status && (status === 'pending_quote' || status === 'pending')) {
      return whenAbsent;
    }
    return whenZero;
  }

  const rounded = Math.round(num);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} FCFA`;
}
