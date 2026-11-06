import { formatMoney } from '../src/utils/currency';
import { normalizeOrderStatus, getOrderStatus, isPendingQuote } from '../src/domain/orderStatus';
import { mapOrder, mapOrderItem } from '../src/domain/orderMapper';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✓ ${msg}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${msg}`);
    failed++;
  }
}

console.log('=== TEST SUITE : VALIDATION DU CHIFFRAGE ET DE LA SYNCHRONISATION ===\n');

// ── TEST 1 : Normalisation et validation des prix ─────────────────────────────
console.log('--- 1. Validation et normalisation des saisies monétaires ---');

function validatePriceInput(raw: string): { valid: boolean; value?: number; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: 'Prix requis' };

  const cleanStr = trimmed.replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (cleanStr.includes('.')) {
    return { valid: false, error: 'Entier FCFA requis (pas de centimes)' };
  }

  const val = Number(cleanStr);
  if (isNaN(val) || val <= 0 || !Number.isInteger(val)) {
    return { valid: false, error: 'Entier positif requis' };
  }

  return { valid: true, value: val };
}

assert(validatePriceInput('12500').valid && validatePriceInput('12500').value === 12500, 'Accepte 12500 (sans espace)');
assert(validatePriceInput('12 500').valid && validatePriceInput('12 500').value === 12500, 'Accepte 12 500 (avec espace)');
assert(validatePriceInput('12\u00a0500').valid && validatePriceInput('12\u00a0500').value === 12500, 'Accepte 12 500 (espace insécable)');
assert(!validatePriceInput('12 500,5').valid && validatePriceInput('12 500,5').error?.includes('centimes'), 'Refuse 12 500,5 (décimale avec virgule)');
assert(!validatePriceInput('12500.50').valid && validatePriceInput('12500.50').error?.includes('centimes'), 'Refuse 12500.50 (décimale avec point)');
assert(!validatePriceInput('-500').valid, 'Refuse montant négatif');
assert(!validatePriceInput('abc').valid, 'Refuse texte alphabétique');
assert(!validatePriceInput('').valid, 'Refuse saisie vide');

// ── TEST 2 : formatMoney et règles anti-zéro ──────────────────────────────────
console.log('\n--- 2. Affichage sécurisé des montants (formatMoney) ---');

assert(formatMoney(125000) === '125 000 FCFA', 'Formatage standard : 125000 -> 125 000 FCFA');
assert(formatMoney(null) === 'À chiffrer', 'Montant null -> « À chiffrer »');
assert(formatMoney(undefined) === 'À chiffrer', 'Montant undefined -> « À chiffrer »');
assert(formatMoney('') === 'À chiffrer', 'Montant vide -> « À chiffrer »');
assert(formatMoney('0', { status: 'pending_quote' }) === 'À chiffrer', 'Montant 0 sur pending_quote -> « À chiffrer »');
assert(formatMoney(0, { status: 'pending_quote' }) === 'À chiffrer', 'Nombre 0 sur commande pending_quote -> « À chiffrer »');
assert(formatMoney(0) === '0 FCFA', 'Vrai montant 0 sur commande confirmée -> 0 FCFA');
assert(formatMoney('invalid') === 'Montant indisponible', 'Valeur invalide -> « Montant indisponible »');

// ── TEST 3 : mapOrder et harmonisation des données ────────────────────────────
console.log('\n--- 3. Normalisation des commandes (mapOrder) ---');

const rawDbOrder = {
  id: 1042,
  order_number: 'CMD-2026-1042',
  status: 'quoted',
  total: 45000,
  subtotal: 45000,
  created_at: '2026-11-02T10:00:00Z',
  establishment_name: 'Clinique Sainte Famille',
  order_items: [
    { id: 1, product_id: 101, name: 'Seringue 5ml', quantity: 10, unit_price: 2500, line_total: 25000 },
    { id: 2, product_id: 102, name: 'Gants latex', quantity: 2, unit_price: 10000, line_total: 20000 },
  ],
};

const mapped = mapOrder(rawDbOrder);
assert(mapped.orderNumber === 'CMD-2026-1042', 'orderNumber préservé');
assert(mapped.total === 45000, 'total préservé');
assert(mapped.items.length === 2, 'items correctement mappés');
assert(mapped.items[0].unit_price === 2500 && mapped.items[0].line_total === 25000, 'Item 1 prix et total corrects');
assert(mapped.items[1].unit_price === 10000 && mapped.items[1].line_total === 20000, 'Item 2 prix et total corrects');

// ── TEST 4 : Règle absolue anti-contradiction statut/montant ──────────────────
console.log('\n--- 4. Protection absolue : aucune commande sans montant marquée Confirmée ---');

const buggyHistoricalOrder = {
  id: 7599,
  order_number: 'CMD-2026-7599',
  status: 'quoted', // Marquée chiffrée par erreur dans la base
  total: 0,         // Mais total à 0
  items: [
    { id: 10, name: 'Aiguille', quantity: 3, unit_price: null, line_total: null },
  ],
};

const mappedBuggy = mapOrder(buggyHistoricalOrder);
const isActuallyPriced = Boolean(mappedBuggy.total && mappedBuggy.total > 0 && !isPendingQuote(mappedBuggy.status));
const effectiveStatus = isActuallyPriced ? mappedBuggy.status : 'pending_quote';
const statusInfo = getOrderStatus(effectiveStatus);

assert(!isActuallyPriced, 'Une commande avec total 0 n’est PAS considérée chiffrée');
assert(effectiveStatus === 'pending_quote', 'Le statut effectif bascule automatiquement sur pending_quote');
assert(statusInfo.adminLabel === 'À chiffrer', 'Le libellé admin devient « À chiffrer »');
assert(statusInfo.pillClass === 'status-pill-amber', 'La pastille devient status-pill-amber');
assert(formatMoney(mappedBuggy.total, { status: effectiveStatus }) === 'À chiffrer', 'Le montant affiché est « À chiffrer »');

console.log(`\n======================================================`);
console.log(`BILAN DES TESTS : ${passed} réussis, ${failed} échoués`);
console.log(`======================================================`);

if (failed > 0) {
  process.exit(1);
}

