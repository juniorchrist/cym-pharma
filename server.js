import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Chargement .env uniquement en développement local
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_URL = (process.env.VITE_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[CYM] FATAL: Variables manquantes SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── App Express ──────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    // Requête sans origin (ex: curl, Render health check)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── Rate limiter en mémoire (120 req/min par IP) ───────────────────────────
const rateMap = new Map();
app.use((req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.reset < now) {
    rateMap.set(ip, { count: 1, reset: now + 60_000 });
    next(); return;
  }
  if (entry.count >= 120) {
    res.status(429).json({ success: false, message: 'Trop de requêtes. Réessayez dans une minute.' });
    return;
  }
  entry.count++;
  next();
});

// ── Nettoyage periodique du rateMap (evite fuites memoire) ─────────────────
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (entry.reset < now) rateMap.delete(ip);
  }
}, 5 * 60 * 1000);

// ─── Utilitaires ─────────────────────────────────────────────────────────────
function send(res, code, payload) {
  res.status(code).json(payload);
}

/**
 * Vérifie le JWT Supabase de la requête et contrôle que le profil est admin actif.
 * Retourne l'userId si OK, null sinon (la réponse HTTP d'erreur est déjà envoyée).
 */
async function requireAdmin(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) {
    send(res, 401, { success: false, message: 'Authentification requise.' });
    return null;
  }
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) {
    send(res, 401, { success: false, message: 'Token invalide ou expiré.' });
    return null;
  }
  const { data: profile, error: profErr } = await db
    .from('profiles')
    .select('role, status')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profErr || !profile || profile.role !== 'admin' || profile.status !== 'active') {
    send(res, 403, { success: false, message: 'Privilèges administrateur requis.' });
    return null;
  }
  return data.user.id;
}

// =============================================================================
// ROUTES PUBLIQUES
// =============================================================================

// GET /api/health — Vérifie la connectivité Supabase réelle
app.get('/api/health', async (_req, res) => {
  try {
    const { error } = await db.from('profiles').select('id').limit(1);
    if (error) {
      send(res, 503, { success: false, status: 'degraded', db: false, message: error.message });
      return;
    }
    send(res, 200, {
      success: true, status: 'ok', db: true,
      server: 'CYM Pharma API v1.0',
      ts: new Date().toISOString(),
    });
  } catch (err) {
    send(res, 503, { success: false, status: 'error', message: err.message });
  }
});

// POST /api/orders — Création commande atomique via RPC PostgreSQL
app.post('/api/orders', async (req, res) => {
  // L'utilisateur peut être authentifié (client connecté) ou non (invité)
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  let userId = null;
  if (token) {
    const { data } = await db.auth.getUser(token);
    userId = data?.user?.id || null;
  }

  const { items, establishment_name, shipping_address, shipping_city, notes } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    send(res, 400, { success: false, message: 'La commande doit comporter au moins un article.' });
    return;
  }
  for (const it of items) {
    if (!it.name || !it.quantity || Number(it.quantity) <= 0) {
      send(res, 400, { success: false, message: `Article invalide : champ "name" ou "quantity" manquant.` });
      return;
    }
  }

  try {
    const { data: result, error } = await db.rpc('create_order_atomic', {
      p_order_data: { user_id: userId, establishment_name, shipping_address, shipping_city, notes },
      p_items: items,
    });
    if (error) { send(res, 500, { success: false, message: error.message }); return; }
    if (!result?.order) { send(res, 500, { success: false, message: 'Commande non enregistrée.' }); return; }

    // Log WhatsApp non-bloquant
    notifyNewOrder(result.order).catch((e) =>
      console.warn('[CYM] WhatsApp notify failed (non-blocking):', e?.message)
    );
    send(res, 201, { success: true, data: { order: result.order } });
  } catch (err) {
    send(res, 500, { success: false, message: err.message || 'Erreur interne.' });
  }
});

// POST /api/contact — Enregistrement formulaire de contact
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message, phone, org } = req.body;
  if (!name || !email || !message) {
    send(res, 400, { success: false, message: 'Champs requis : name, email, message.' });
    return;
  }
  const { error } = await db.from('contact_messages').insert({
    name, email,
    phone: phone || null,
    org: org || null,
    subject: subject || 'Contact site web',
    message,
  });
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 201, { success: true, message: 'Message reçu. Nous vous répondrons sous 48h.' });
});

// =============================================================================
// ROUTES ADMIN (JWT admin requis)
// =============================================================================

// GET /api/admin/orders — Liste des commandes avec leurs articles
app.get('/api/admin/orders', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { status, limit = 100, offset = 0 } = req.query;
  let query = db
    .from('orders')
    .select('*, items:order_items(*), client:profiles(name, email, phone, establishment_name)')
    .order('created_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1);

  if (status) query = query.eq('status', String(status));

  const { data, error } = await query;
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { orders: data || [] } });
});

// PATCH /api/admin/orders/:id/status — Changement de statut + historique
app.patch('/api/admin/orders/:id/status', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { id } = req.params;
  const { status, note } = req.body;
  if (!status || typeof status !== 'string') {
    send(res, 400, { success: false, message: 'Champ "status" requis.' });
    return;
  }

  const VALID_STATUSES = [
    'En attente de chiffrage',
    'Devis envoyé',
    'Confirmée',
    'En préparation',
    'Expédiée',
    'Livrée',
    'Annulée',
  ];
  if (!VALID_STATUSES.includes(status)) {
    send(res, 400, { success: false, message: `Statut invalide. Valeurs acceptées : ${VALID_STATUSES.join(', ')}` });
    return;
  }

  const now = new Date().toISOString();
  const { error: updateErr } = await db.from('orders').update({ status, updated_at: now }).eq('id', id);
  if (updateErr) { send(res, 500, { success: false, message: updateErr.message }); return; }

  await db.from('order_status_history').insert({
    order_id: id, status,
    note: note || null,
    changed_by: adminId,
  });

  send(res, 200, { success: true });
});

// GET /api/admin/users — Liste des clients (profils)
app.get('/api/admin/users', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { data, error } = await db
    .from('profiles')
    .select('*, client_reminders(id, status, opened_at, template_key)')
    .neq('role', 'admin')
    .order('created_at', { ascending: false });

  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { users: data || [] } });
});

// PATCH /api/admin/users/:id/status — Activation/désactivation client
app.patch('/api/admin/users/:id/status', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { id } = req.params;
  const { status } = req.body;
  if (!status) { send(res, 400, { success: false, message: 'Champ "status" requis.' }); return; }

  const { error } = await db.from('profiles').update({ status }).eq('id', id);
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true });
});

// POST /api/admin/reminders/check — Marque les clients inactifs
app.post('/api/admin/reminders/check', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { data, error } = await db.rpc('mark_inactive_clients');
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: data || null });
});

// GET /api/admin/reminders/templates — Templates de relance WhatsApp
app.get('/api/admin/reminders/templates', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { data, error } = await db.from('reminder_templates').select('*').order('is_default', { ascending: false });
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { templates: data || [] } });
});

// POST /api/admin/reminders — Enregistrer un rappel manuel
app.post('/api/admin/reminders', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const { userId, templateKey } = req.body;
  if (!userId || !templateKey) {
    send(res, 400, { success: false, message: 'Champs requis : userId, templateKey.' });
    return;
  }
  const { data, error } = await db.from('client_reminders').insert({
    user_id: String(userId), template_key: templateKey,
    channel: 'whatsapp_manuel', opened_by: adminId,
    status: 'opened', opened_at: new Date().toISOString(),
  }).select().single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 201, { success: true, data: { reminder: data } });
});

// POST /api/admin/reminders/:id/confirm — Confirmer l'envoi d'un rappel
app.post('/api/admin/reminders/:id/confirm', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;

  const now = new Date().toISOString();
  const { data, error } = await db
    .from('client_reminders')
    .update({ status: 'confirmed', confirmed_at: now })
    .eq('id', req.params.id)
    .select().single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  if (data?.user_id) {
    await db.from('profiles').update({ last_reminder_at: now }).eq('id', data.user_id);
  }
  send(res, 200, { success: true, data: { reminder: data } });
});

// =============================================================================
// NOTIFICATION WHATSAPP (wa.me — log uniquement, conforme Meta)
// =============================================================================
async function notifyNewOrder(order) {
  const phones = [
    process.env.WHATSAPP_ADMIN_PHONE_1 || '2250707079746',
    process.env.WHATSAPP_ADMIN_PHONE_2 || '',
  ].map((p) => p.replace(/\D/g, '')).filter(Boolean);

  const date = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' });
  const msg = `*CYM Pharma* — Nouvelle commande reçue\n`
    + `N° : ${order.order_number || order.id}\n`
    + `Établissement : ${order.establishment_name || 'N/A'}\n`
    + `Articles : ${(order.items || []).length}\n`
    + `Date : ${date}\n`
    + `→ Connectez-vous à l'espace admin pour chiffrer.`;

  for (const phone of phones) {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    console.log(`[WhatsApp] Notif admin → ${url}`);
  }

  // Persistance dans relance_logs (non-bloquant)
  await db.from('relance_logs').insert({
    user_id: order.user_id || null,
    establishment_name: order.establishment_name || '',
    channel: 'whatsapp_auto',
    subject: `Nouvelle commande ${order.order_number || order.id}`,
    message: msg,
    trigger_reason: 'new_order',
    status: 'pending',
  }).then(({ error }) => {
    if (error) console.warn('[CYM] relance_log write error:', error.message);
  });
}

// =============================================================================
// HANDLERS GLOBAUX
// =============================================================================
app.use((_req, res) => send(res, 404, { success: false, message: 'Route introuvable.' }));
app.use((err, _req, res, _next) => {
  console.error('[CYM SERVER ERROR]', err?.message || err);
  send(res, 500, { success: false, message: 'Erreur interne du serveur.' });
});

// =============================================================================
// DÉMARRAGE
// =============================================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ CYM Pharma API démarrée — port ${PORT}`);
  console.log(`   Frontend CORS : ${FRONTEND_URL}`);
  console.log(`   Supabase URL  : ${SUPABASE_URL.replace(/\/\/.*@/, '//***@')}`);
});
