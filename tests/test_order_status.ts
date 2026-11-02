import { normalizeOrderStatus, getOrderStatus, isPendingQuote, isQuoted, ALLOWED_TRANSITIONS } from '../src/domain/orderStatus';

console.log('--- TEST 1: Normalisation des statuts de commande ---');
const testCases = [
  { raw: 'En attente de chiffrage', expectedCode: 'pending_quote', expectedPending: true },
  { raw: 'En attente de devis', expectedCode: 'pending_quote', expectedPending: true },
  { raw: 'pending', expectedCode: 'pending_quote', expectedPending: true },
  { raw: 'Chiffrée', expectedCode: 'quoted', expectedPending: false },
  { raw: 'Devis envoyé', expectedCode: 'quoted', expectedPending: false },
  { raw: 'quoted', expectedCode: 'quoted', expectedPending: false },
  { raw: 'confirmed', expectedCode: 'confirmed', expectedPending: false },
  { raw: 'delivered', expectedCode: 'delivered', expectedPending: false },
  { raw: 'Livrée', expectedCode: 'delivered', expectedPending: false },
  { raw: 'cancelled', expectedCode: 'cancelled', expectedPending: false },
  { raw: 'Annulée', expectedCode: 'cancelled', expectedPending: false },
];

let allPassed = true;
for (const tc of testCases) {
  const code = normalizeOrderStatus(tc.raw);
  const info = getOrderStatus(tc.raw);
  const pending = isPendingQuote(tc.raw);
  const quoted = isQuoted(tc.raw);

  const ok = code === tc.expectedCode && pending === tc.expectedPending;
  if (!ok) {
    console.error(`FAIL for ${tc.raw}: got code=${code}, pending=${pending}`);
    allPassed = false;
  } else {
    console.log(`✓ '${tc.raw}' -> code=${code}, adminLabel='${info.adminLabel}', clientLabel='${info.clientLabel}', pill='${info.pillClass}'`);
  }
}

console.log('\n--- TEST 2: Transitions de statut (Chiffrage = Confirmation) ---');
const quotedTransitions = ALLOWED_TRANSITIONS.quoted;
if (quotedTransitions.includes('in_preparation') && quotedTransitions.includes('shipped')) {
  console.log(`✓ 'quoted' peut directement passer en 'in_preparation' ou 'shipped': [${quotedTransitions.join(', ')}]`);
} else {
  console.error(`FAIL: 'quoted' ne permet pas la transition directe vers 'in_preparation'.`);
  allPassed = false;
}

if (allPassed) {
  console.log('\n✅ TOUS LES TESTS DE STATUT SONT VALIDES AVEC SUCCÈS.');
} else {
  console.error('\n❌ DES ERREURS ONT ÉTÉ DÉTECTÉES.');
  process.exit(1);
}

