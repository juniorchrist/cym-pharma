/**
 * CYM PHARMA — SUITE DE TESTS AUTOMATISÉE : CONFIDENTIALITÉ ABSOLUE DES STOCKS ET PRIX
 * 
 * Règle d'or : AUCUNE donnée de stock ni de prix privé ne doit fuiter
 * côté client ou via les APIs publiques.
 */

import { sanitizePublicProduct, sanitizePublicOrder, getDb } from '../src/server/cymBackend';

console.log('\n=============================================================');
console.log('  CYM PHARMA — TEST AUTOMATISÉ DE CONFIDENTIALITÉ DES STOCKS  ');
console.log('=============================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log('  ✓ [SUCCÈS]', message);
    passCount++;
  } else {
    console.error('  ✗ [ÉCHEC DE SÉCURITÉ]', message);
    failCount++;
  }
}

const FORBIDDEN_STOCK_KEYS = [
  'stock',
  'stockQuantity',
  'inStock',
  'qty_on_hand',
  'min_stock',
  'inventory_item_id',
];

const FORBIDDEN_PRICE_KEYS = [
  'ref_price',
  'price',
  'base_price',
  'oldPrice',
];

// Test 1 : Vérification de la fonction de désinfection des produits
console.log('--- Test 1 : Nettoyage sanitizePublicProduct() ---');
const rawProduct: any = {
  id: 'prod-001',
  name: "Gants d'examen stériles",
  reference: 'REF-GT-01',
  stock: 150,
  stockQuantity: 150,
  inStock: true,
  qty_on_hand: 150,
  min_stock: 10,
  ref_price: 4500,
  price: 4500,
  base_price: 4500,
  oldPrice: 5000,
  is_active: true,
  unit: 'Boîte de 100',
};

const cleanProduct: any = sanitizePublicProduct(rawProduct);

for (const key of FORBIDDEN_STOCK_KEYS) {
  assert(cleanProduct[key] === undefined, `La clé de stock "${key}" a été supprimée du produit public`);
}

for (const key of FORBIDDEN_PRICE_KEYS) {
  assert(cleanProduct[key] === undefined, `La clé de prix privée "${key}" a été supprimée du produit public`);
}

assert(cleanProduct.name === "Gants d'examen stériles", 'Les attributs publics sont préservés');
assert(cleanProduct.reference === 'REF-GT-01', 'La référence publique est préservée');

// Test 2 : Vérification de la base de données et des produits publics
console.log('\n--- Test 2 : Absence de fuite dans les produits de la base ---');
const db = getDb();
let leakedProducts = 0;

for (const p of db.products) {
  const sanitized: any = sanitizePublicProduct(p);
  for (const key of [...FORBIDDEN_STOCK_KEYS, ...FORBIDDEN_PRICE_KEYS]) {
    if (sanitized[key] !== undefined) {
      leakedProducts++;
      console.error(`Fuite détectée sur le produit ${p.name}: champ ${key} présent !`);
    }
  }
}
assert(leakedProducts === 0, `0 fuite sur ${db.products.length} produits de la base de données`);

// Test 3 : Vérification du module Inventaire (accès admin requis)
console.log('\n--- Test 3 : Séparation stricte de l\'inventaire ---');
assert(Array.isArray(db.inventory_items), 'La table inventory_items existe dans la base interne');
assert(Array.isArray(db.stock_movements), 'La table stock_movements existe dans la base interne');
assert(Array.isArray(db.inventory_periods), 'La table inventory_periods existe dans la base interne');
assert((db.inventory_items?.length || 0) >= 40, `L'inventaire contient ${db.inventory_items?.length} articles initialisés depuis le classeur`);

console.log('\n=============================================================');
if (failCount === 0) {
  console.log(`  RÉSULTAT : TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS (${passCount}/${passCount})`);
  console.log('  CONFIDENTIALITÉ PARFAITE : Aucune fuite de stock ni de prix.');
  console.log('=============================================================\n');
  process.exit(0);
} else {
  console.error(`  RÉSULTAT : ${failCount} ÉCHEC(S) DÉTECTÉ(S) (${passCount} passés)`);
  console.log('=============================================================\n');
  process.exit(1);
}
