import * as XLSX from 'xlsx';
import http from 'http';

// Helper pour requêtes HTTP
function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

export async function runIntegrationTests(port = 4000) {
  console.log('=============================================================================');
  console.log('CYM PHARMA — SUITE DE TESTS D\'INTÉGRATION DU MODULE INVENTAIRE & STOCKS');
  console.log('=============================================================================');

  // 1. Création du classeur synthétique de test avec suffixe d'exécution pour isolation
  const runId = Math.random().toString(36).slice(2, 6).toUpperCase();
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['DESIGNATION', 'STOCK INITIAL', 'STOCK EN COURS'],
    [`COMPRESSES STERILES ${runId} 10X10 B/100`, 100, 80],       // Valide
    [`GANTS D'EXAMEN LATEX ${runId} T7 B/100`, 50, -10],        // Négatif
    [`SERINGUE 5ML 3P ${runId} B/100`, 200, 150],                // Valide
    [`COMPRESSES STERILES ${runId} 10X10 B/100`, 100, 80],       // Doublon de la ligne 2
    [`ALCOOL CHIRURGICAL 70 ${runId} 1L`, 30, 25],               // Valide
    ['', 0, 0],                                         // Ligne vide (ignorée)
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Stock_Test');

  // Parser comme le ferait le navigateur (flux client-side)
  const rawSheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const parsedRows = rawSheetData.slice(1).map((r) => ({
    designation: r[0],
    stock_opening: r[1],
    stock_current: r[2],
  }));

  console.log('\n[TEST 1] Vérification de l\'authentification requise (sans token)');
  const resNoAuth = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/admin/inventory/import/commit',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { rows: parsedRows });
  console.log(`  Statut HTTP reçu : ${resNoAuth.status} (attendu : 401)`);
  console.log(`  Réponse : ${JSON.stringify(resNoAuth.data)}`);
  if (resNoAuth.status !== 401) throw new Error('Échec TEST 1 : 401 attendu');
  console.log('  -> TEST 1 RÉUSSI ✓');

  console.log('\n[TEST 2] Vérification de la validation stricte des données (HTTP 422 si rows vide)');
  const resInvalid = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/admin/inventory/import/commit',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer admin_jwt_local_demo',
    },
  }, { rows: [] });
  console.log(`  Statut HTTP reçu : ${resInvalid.status} (attendu : 422)`);
  console.log(`  Réponse : ${JSON.stringify(resInvalid.data)}`);
  if (resInvalid.status !== 422) throw new Error('Échec TEST 2 : 422 attendu');
  console.log('  -> TEST 2 RÉUSSI ✓');

  console.log('\n[TEST 3] Analyse et prévisualisation (détection doublons, négatifs, ignorés)');
  const resPreview = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/admin/inventory/import/preview',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer admin_jwt_local_demo',
    },
  }, { rows: parsedRows });
  console.log(`  Statut HTTP reçu : ${resPreview.status} (attendu : 200)`);
  const preview = resPreview.data?.data;
  console.log('  Données d\'analyse :');
  console.log(`    - Total lignes valides : ${preview.total_rows}`);
  console.log(`    - Articles positifs    : ${preview.valid}`);
  console.log(`    - Doublons détectés    : ${preview.duplicates}`);
  console.log(`    - Stocks négatifs      : ${preview.negative}`);
  console.log(`    - Lignes ignorées      : ${preview.ignored}`);

  if (preview.duplicates !== 1) throw new Error('Échec TEST 3 : 1 doublon attendu');
  if (preview.negative !== 1) throw new Error('Échec TEST 3 : 1 négatif attendu');
  if (preview.ignored !== 1) throw new Error('Échec TEST 3 : 1 ligne ignorée attendue');
  console.log('  -> TEST 3 RÉUSSI ✓');

  console.log('\n[TEST 4] Importation par lot de 50 (première exécution)');
  const resCommit1 = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/admin/inventory/import/commit',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer admin_jwt_local_demo',
    },
  }, {
    rows: preview.rows,
    movement_date: '2026-11-08',
  });
  console.log(`  Statut HTTP reçu : ${resCommit1.status} (attendu : 200)`);
  console.log(`  Résultats : ${JSON.stringify(resCommit1.data?.data)}`);
  const c1 = resCommit1.data?.data;
  if (c1.created !== 4) throw new Error(`Échec TEST 4 : 4 créés attendus (reçu: ${c1.created})`);
  if (c1.skipped !== 1) throw new Error(`Échec TEST 4 : 1 ignoré attendu (reçu: ${c1.skipped})`);
  console.log('  -> TEST 4 RÉUSSI ✓');

  console.log('\n[TEST 5] IDEMPOTENCE STRICTE : Relance de l\'import avec le même classeur');
  const resCommit2 = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/admin/inventory/import/commit',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer admin_jwt_local_demo',
    },
  }, {
    rows: preview.rows,
    movement_date: '2026-11-08',
  });
  console.log(`  Statut HTTP reçu : ${resCommit2.status} (attendu : 200)`);
  console.log(`  Résultats relance : ${JSON.stringify(resCommit2.data?.data)}`);
  const c2 = resCommit2.data?.data;
  if (c2.created !== 0) throw new Error(`Échec TEST 5 : 0 créé attendu (reçu: ${c2.created})`);
  if (c2.updated !== 4) throw new Error(`Échec TEST 5 : 4 mis à jour attendus (reçu: ${c2.updated})`);
  if (c2.skipped !== 1) throw new Error(`Échec TEST 5 : 1 ignoré attendu (reçu: ${c2.skipped})`);
  console.log('  -> TEST 5 RÉUSSI ✓ (AUCUN DOUBLON CRÉÉ DANS LA BASE)');

  console.log('\n[TEST 6] Consultation des statistiques et de la liste des articles');
  const resItems = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/admin/inventory/items?limit=10',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer admin_jwt_local_demo',
    },
  });
  console.log(`  Statut HTTP reçu : ${resItems.status} (attendu : 200)`);
  console.log(`  Total articles en base : ${resItems.data?.data?.total}`);
  const items = resItems.data?.data?.items || [];
  console.log('  Articles retournés :');
  items.forEach((it) => {
    console.log(`    - [${it.code}] ${it.designation} | Stock: ${it.qty_on_hand} ${it.unit_label} | Statut: ${it.status}`);
  });
  console.log('  -> TEST 6 RÉUSSI ✓');

  console.log('\n[TEST 7] Bilan Mensuel des flux & consommations');
  const resMonthly = await request({
    hostname: '127.0.0.1',
    port,
    path: '/api/admin/inventory/monthly-report?year=2026&month=11',
    method: 'GET',
    headers: {
      'Authorization': 'Bearer admin_jwt_local_demo',
    },
  });
  console.log(`  Statut HTTP reçu : ${resMonthly.status} (attendu : 200)`);
  const mRep = resMonthly.data?.data;
  console.log(`  Bilan ${mRep?.month_label} :`);
  console.log(`    - Produits concernés   : ${mRep?.summary?.total_products}`);
  console.log(`    - Entrées totales      : +${mRep?.summary?.total_entries}`);
  console.log(`    - Sorties totales      : -${mRep?.summary?.total_exits}`);
  console.log(`    - Ajustements nets     : ${mRep?.summary?.total_adjustments}`);
  console.log(`    - Ruptures             : ${mRep?.summary?.count_ruptures}`);
  console.log(`    - Négatifs             : ${mRep?.summary?.count_negatifs}`);
  if (resMonthly.status !== 200) throw new Error('Échec TEST 7 : 200 attendu');
  console.log('  -> TEST 7 RÉUSSI ✓');

  console.log('\n=============================================================================');
  console.log('TOUS LES TESTS D\'INTÉGRATION DU MODULE INVENTAIRE SONT VALIDÉS AVEC SUCCÈS !');
  console.log('=============================================================================');
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('inventory_integration.js')) {
  runIntegrationTests().then(() => process.exit(0)).catch((err) => {
    console.error('\nERREUR TEST:', err);
    process.exit(1);
  });
}

