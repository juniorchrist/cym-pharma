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
