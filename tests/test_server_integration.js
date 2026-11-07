import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_URL = 'http://127.0.0.1:4000/api';

const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== TEST D\'INTÉGRATION COMPLET CONTRE SERVER.JS ===\n');

  // ── TEST 1 : CORS Preflight ──────────────────────────────────────────────────
  console.log('1. Contrôle CORS Preflight :');
  const corsRes = await fetch(`${API_URL}/admin/orders/test/quote`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:4173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Authorization, Content-Type',
    },
  });
  assert(corsRes.status === 204, 'OPTIONS renvoie HTTP 204');
  assert(
    corsRes.headers.get('access-control-allow-origin') === 'http://localhost:4173',
    'access-control-allow-origin est bien http://localhost:4173'
  );
  assert(
    corsRes.headers.get('access-control-allow-credentials') === 'true',
    'access-control-allow-credentials est bien true'
  );

  // ── TEST 2 : Sécurité sans token ─────────────────────────────────────────────
  console.log('\n2. Sécurité : accès sans jeton (401) :');
  const noTokenQuote = await fetch(`${API_URL}/admin/orders/test/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] }),
  });
  assert(noTokenQuote.status === 401, 'POST /admin/orders/:id/quote sans jeton -> 401');

  const noTokenSync = await fetch(`${API_URL}/sync/state`);
  assert(noTokenSync.status === 401, 'GET /sync/state sans jeton -> 401');

  // ── TEST 3 : Authentification des utilisateurs de test (Admin & Client) ──────
  console.log('\n3. Authentification des utilisateurs de test (Admin & Client) :');
  const anonClient = createClient(SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');

  // 1. Authentification Admin via generateLink + verifyOtp
  const { data: adminLink } = await adminDb.auth.admin.generateLink({
    type: 'magiclink',
    email: 'admin@cympharma.ci',
  });
  const adminOtp = adminLink.properties.email_otp;
  const { data: adminSession, error: adminAuthErr } = await anonClient.auth.verifyOtp({
    email: 'admin@cympharma.ci',
    token: adminOtp,
    type: 'magiclink',
  });
  if (adminAuthErr || !adminSession?.session?.access_token) {
    throw new Error(`Échec auth admin: ${adminAuthErr?.message}`);
  }
  const adminToken = adminSession.session.access_token;
  const adminUserId = adminSession.user.id;

  // 2. Création et authentification Client temporaire
  const testClientEmail = `test_client_${Date.now()}@cympharma.ci`;
  const testPassword = 'TestPassword123!_CYM';
  const { data: clientUser, error: clientErr } = await adminDb.auth.admin.createUser({
    email: testClientEmail,
    password: testPassword,
    email_confirm: true,
  });
  if (clientErr || !clientUser.user) {
    throw new Error(`Échec création client test: ${clientErr?.message}`);
  }
  const { data: clientSession } = await anonClient.auth.signInWithPassword({
    email: testClientEmail,
    password: testPassword,
  });
  const clientToken = clientSession?.session?.access_token || '';

  assert(Boolean(adminToken), 'Jeton JWT Admin récupéré');
  assert(Boolean(clientToken), 'Jeton JWT Client récupéré');

  // ── TEST 4 : Sécurité jeton client sur route admin (403) ─────────────────────
  console.log('\n4. Sécurité : jeton client sur route admin (403) :');
  const clientOnAdminQuote = await fetch(`${API_URL}/admin/orders/test/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clientToken}`,
    },
    body: JSON.stringify({ items: [] }),
  });
  assert(clientOnAdminQuote.status === 403, 'POST /admin/orders/:id/quote avec jeton client -> 403 Forbidden');

  // Client sur /sync/state -> doit réussir avec role: client
  const clientSync = await fetch(`${API_URL}/sync/state`, {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  const clientSyncData = await clientSync.json();
  assert(clientSync.status === 200, 'GET /sync/state avec jeton client -> 200 OK');
  assert(clientSyncData.data?.role === 'client', 'GET /sync/state identifie le rôle client');

  // ── TEST 5 : Création d'une commande test pour chiffrage ─────────────────────
  console.log('\n5. Test de validation de charge utile chiffrage (422) & succès (200) :');
  const testOrderId = `CMD-TEST-${Date.now()}`;
  await adminDb.from('orders').insert({
    id: testOrderId,
    order_number: testOrderId,
    user_id: clientUser.user.id,
    establishment_name: 'Pharmacie Test',
    status: 'pending_quote',
    total: 0,
    subtotal: 0,
  });

  const { data: insertedItem } = await adminDb
    .from('order_items')
    .insert({
      order_id: testOrderId,
      name: 'Gants latex poudrés M',
      reference: 'GANT-LAT-M',
      unit: 'Boîte',
      quantity: 5,
      unit_price: 0,
      line_total: 0,
    })
    .select()
    .single();

  const itemId = insertedItem.id;

  // Cas 5.a : Prix manquant / vide -> 422
  const missingPriceRes = await fetch(`${API_URL}/admin/orders/${testOrderId}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ items: [{ itemId, unit_price: '' }] }),
  });
  console.log('DEBUG 5.a response:', missingPriceRes.status, await missingPriceRes.text());
  assert(missingPriceRes.status === 422, 'Prix vide ou manquant -> 422');

  // Cas 5.b : Prix négatif -> 422
  const negPriceRes = await fetch(`${API_URL}/admin/orders/${testOrderId}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ items: [{ itemId, unit_price: -500 }] }),
  });
  assert(negPriceRes.status === 422, 'Prix négatif -> 422');

  // Cas 5.c : Prix décimal avec centimes -> 422
  const decPriceRes = await fetch(`${API_URL}/admin/orders/${testOrderId}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ items: [{ itemId, unit_price: 2500.5 }] }),
  });
  assert(decPriceRes.status === 422, 'Prix avec décimales/centimes -> 422');

  // Cas 5.d : Chiffrage valide -> 200 + total recalculé et relu
  const validQuoteRes = await fetch(`${API_URL}/admin/orders/${testOrderId}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ items: [{ itemId, unit_price: 3500 }] }),
  });
  const validData = await validQuoteRes.json();
  console.log('DEBUG 5.d validQuoteRes:', validQuoteRes.status, validData);
  assert(validQuoteRes.status === 200, 'Chiffrage valide -> HTTP 200 OK');
  assert(validData.data?.total === 17500, 'Total calculé 5 * 3500 = 17 500 FCFA');
  assert(validData.data?.order?.status === 'quoted', 'Statut passé à "quoted"');
  assert(validData.data?.invoice_number === `FAC-${testOrderId.replace('CMD-', '')}`, 'Numéro de facture généré');

  // Relecture directe Supabase pour certifier la persistance
  const { data: verifiedOrder } = await adminDb
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', testOrderId)
    .single();

  assert(verifiedOrder?.status === 'quoted', 'Vérification DB : statut = quoted');
  assert(Number(verifiedOrder?.total) === 17500, 'Vérification DB : total = 17500 FCFA');
  assert(Number(verifiedOrder?.items[0]?.line_total) === 17500, 'Vérification DB : ligne = 17500 FCFA');

  // Nettoyage des données de test
  await adminDb.from('order_status_history').delete().eq('order_id', testOrderId);
  await adminDb.from('order_items').delete().eq('order_id', testOrderId);
  await adminDb.from('orders').delete().eq('id', testOrderId);
  await adminDb.auth.admin.deleteUser(clientUser.user.id);
  await adminDb.from('profiles').delete().eq('id', clientUser.user.id);

  console.log(`\n=== BILAN DES TESTS : ${passed} RÉUSSIS / ${failed} ÉCHECS ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Erreur fatale test intégration:', err);
  process.exit(1);
});
