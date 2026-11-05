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
 * Affiche un montant en FCFA en distinguant :
 * - valeur absente (null/undefined/'') → `whenAbsent` (défaut '—')
 * - valeur invalide (NaN) → `whenAbsent`
 * - valeur nulle réelle (0) → `whenZero` (défaut '0 FCFA')
 * - valeur positive → formatée en FCFA
 *
 * Utilisez cette fonction partout où le montant peut être absent
 * (commande non chiffrée) pour ne jamais afficher "0 FCFA" par erreur.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  options: { whenAbsent?: string; whenZero?: string } = {}
): string {
  const { whenAbsent = '—', whenZero = '0 FCFA' } = options;

  if (amount === null || amount === undefined || amount === '') return whenAbsent;

  const num = typeof amount === 'string'
    ? parseFloat(String(amount).replace(/\s/g, '').replace(',', '.'))
    : amount;

  if (isNaN(num)) return whenAbsent;
  if (num === 0) return whenZero;

  const rounded = Math.round(num);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${formatted} FCFA`;
}
