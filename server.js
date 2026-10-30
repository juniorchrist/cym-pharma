// =============================================================================
// CYM Pharma — Serveur Express de Production (Render)
// Point d'entrée autonome en ES Modules — Connecté à Supabase PostgreSQL
// =============================================================================

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Chargement .env uniquement en développement local
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_URL = (process.env.VITE_FRONTEND_URL || 'https://cympharma.infinityfreeapp.com').replace(/\/+$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[CYM SERVER FATAL] Variables manquantes : SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Client Supabase avec clé service_role (bypasses RLS côté serveur)
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Application Express ──────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  FRONTEND_URL,
  'https://cympharma.infinityfreeapp.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin) || origin.endsWith('.infinityfreeapp.com')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ─── Rate Limiter (120 requêtes / minute par IP) ──────────────────────────────
const rateMap = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.reset < now) {
    rateMap.set(ip, { count: 1, reset: now + 60_000 });
    next();
    return;
  }
  if (entry.count >= 120) {
    res.status(429).json({ success: false, message: 'Trop de requêtes. Veuillez patienter une minute.' });
    return;
  }
  entry.count++;
  next();
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (entry.reset < now) rateMap.delete(ip);
  }
}, 5 * 60 * 1000);

// Helper JSON
function send(res, code, payload) {
  res.status(code).json(payload);
}

// ─── Middlewares d'Authentification ───────────────────────────────────────────
async function requireUser(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) {
    send(res, 401, { success: false, message: 'Authentification requise.' });
    return null;
  }
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) {
    send(res, 401, { success: false, message: 'Session invalide ou expirée.' });
    return null;
  }
  const { data: profile } = await db.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
  return { user: data.user, profile };
}

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

// ─── ROUTEUR PRINCIPAL (Monté sur /api ET /) ──────────────────────────────────
const router = express.Router();

// 1. Santé du serveur & connectivité base
router.get('/health', async (_req, res) => {
  try {
    const { error } = await db.from('categories').select('count', { count: 'exact', head: true });
    if (error) {
      send(res, 503, { success: false, status: 'degraded', db: false, message: error.message });
      return;
    }
    send(res, 200, {
      success: true,
      status: 'ok',
      db: true,
      server: 'CYM Pharma API v2.0 (Render)',
      ts: new Date().toISOString(),
    });
  } catch (err) {
    send(res, 503, { success: false, status: 'error', message: err.message });
  }
});

// 2. Catégories publiques
router.get('/categories', async (_req, res) => {
  try {
    const { data, error } = await db.from('categories').select('name').eq('is_active', true).order('sort_order');
    if (error) { send(res, 500, { success: false, message: error.message }); return; }
    send(res, 200, { success: true, data: { categories: (data || []).map((c) => c.name) } });
  } catch (err) {
    send(res, 500, { success: false, message: err.message });
  }
});

// 3. Produits publics (RÈGLE MÉTIER STRICTE : aucun prix ni stock privé retourné)
router.get('/products', async (req, res) => {
  try {
    const { category, search, limit = 100, offset = 0 } = req.query;
    let query = db.from('products').select('*', { count: 'exact' }).eq('is_active', true).eq('is_published', true);

    if (category) query = query.ilike('category', `%${category}%`);
    if (search) query = query.or(`name.ilike.%${search}%,reference.ilike.%${search}%`);

    query = query.order('name').range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, count, error } = await query;
    if (error) { send(res, 500, { success: false, message: error.message }); return; }

    // Masquage absolu des prix internes et stocks pour l'espace public
    const sanitized = (data || []).map((p) => ({
      ...p,
      ref_price: 0,
      price: 0,
      purchase_cost: undefined,
      stock: undefined,
      qty_on_hand: undefined,
    }));

    send(res, 200, {
      success: true,
      data: {
        products: sanitized,
        pagination: { total: count ?? sanitized.length },
      },
    });
  } catch (err) {
    send(res, 500, { success: false, message: err.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const { data, error } = await db.from('products').select('*').eq('id', req.params.id).maybeSingle();
    if (error || !data) { send(res, 404, { success: false, message: 'Produit introuvable.' }); return; }
    const sanitized = {
      ...data,
      ref_price: 0,
      price: 0,
      purchase_cost: undefined,
      stock: undefined,
      qty_on_hand: undefined,
    };
    send(res, 200, { success: true, data: { product: sanitized } });
  } catch (err) {
    send(res, 500, { success: false, message: err.message });
  }
});

// 4. Formulaire de contact
router.post('/contact', async (req, res) => {
  const { name, email, subject, message, phone, org } = req.body;
  if (!name || !email || !message) {
    send(res, 400, { success: false, message: 'Champs requis : name, email, message.' });
    return;
  }
  const { error } = await db.from('contact_messages').insert({
    name,
    email,
    phone: phone || null,
    org: org || null,
    subject: subject || 'Contact site web',
    message,
  });
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 201, { success: true, message: 'Message reçu. Nous vous répondrons sous 48h.' });
});

// 5. Authentification client / admin
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    send(res, 400, { success: false, message: 'Email et mot de passe requis.' });
    return;
  }
  const { data: authData, error: authErr } = await db.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (authErr || !authData?.user || !authData?.session) {
    send(res, 401, { success: false, message: authErr?.message || 'Identifiants invalides.' });
    return;
  }
  const { data: profile } = await db.from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
  const user = {
    id: authData.user.id,
    email: authData.user.email,
    name: profile?.name || authData.user.user_metadata?.name || '',
    first_name: profile?.first_name,
    last_name: profile?.last_name,
    role: profile?.role || 'client',
    establishment_name: profile?.establishment_name,
    phone: profile?.phone,
    status: profile?.status || 'active',
  };
  send(res, 200, { success: true, data: { token: authData.session.access_token, user } });
});

router.post('/auth/register', async (req, res) => {
  const { email, password, name, first_name, last_name, establishment_name, phone } = req.body;
  if (!email || !password) {
    send(res, 400, { success: false, message: 'Email et mot de passe requis.' });
    return;
  }
  const { data: authData, error: authErr } = await db.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        name: name || `${first_name || ''} ${last_name || ''}`.trim(),
        role: 'client',
        establishment_name,
        phone,
      },
    },
  });
  if (authErr || !authData?.user) {
    send(res, 400, { success: false, message: authErr?.message || "Erreur lors de l'enregistrement." });
    return;
  }
  const user = {
    id: authData.user.id,
    email: authData.user.email,
    name: name || `${first_name || ''} ${last_name || ''}`.trim(),
    role: 'client',
    establishment_name,
    phone,
    status: 'pending',
  };
  send(res, 201, { success: true, data: { token: authData.session?.access_token, user } });
});

// 6. Profil utilisateur connecté
router.get('/users/profile', async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  send(res, 200, { success: true, data: { user: auth.profile || auth.user } });
});

router.put('/users/profile', async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { name, first_name, last_name, phone, establishment_name, commune, address } = req.body;
  // Ne permet JAMAIS de modifier le rôle via cette route
  const { data: updated, error } = await db
    .from('profiles')
    .update({ name, first_name, last_name, phone, establishment_name, commune, address, updated_at: new Date().toISOString() })
    .eq('id', auth.user.id)
    .select()
    .single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { user: updated } });
});

router.put('/users/password', async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    send(res, 400, { success: false, message: 'Le mot de passe doit comporter au moins 6 caractères.' });
    return;
  }
  const { error } = await db.auth.admin.updateUserById(auth.user.id, { password: newPassword });
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, message: 'Mot de passe mis à jour avec succès.' });
});

router.get('/users/dashboard', async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { data: orders } = await db.from('orders').select('*').eq('user_id', auth.user.id).order('created_at', { ascending: false });
  const stats = {
    totalOrders: orders?.length || 0,
    pendingQuotes: orders?.filter((o) => o.status === 'En attente de chiffrage').length || 0,
    confirmedOrders: orders?.filter((o) => o.status === 'Confirmée').length || 0,
  };
  send(res, 200, {
    success: true,
    data: {
      user: auth.profile || auth.user,
      stats,
      recentOrders: (orders || []).slice(0, 5),
    },
  });
});

// 7. Commandes (Création, consultation)
router.post('/orders', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
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

  try {
    const { data: result, error } = await db.rpc('create_order_atomic', {
      p_order_data: { user_id: userId, establishment_name, shipping_address, shipping_city, notes },
      p_items: items,
    });
    if (error) { send(res, 500, { success: false, message: error.message }); return; }
    if (!result?.order) { send(res, 500, { success: false, message: 'Commande non enregistrée.' }); return; }

    // Alerte WhatsApp asynchrone non-bloquante
    notifyNewOrder(result.order).catch((e) => console.warn('[CYM WhatsApp Alert]', e?.message));

    send(res, 201, { success: true, data: { order: result.order } });
  } catch (err) {
    send(res, 500, { success: false, message: err.message || 'Erreur interne.' });
  }
});

router.get('/orders', async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const isAdmin = auth.profile?.role === 'admin';
  let query = db.from('orders').select('*, items:order_items(*)').order('created_at', { ascending: false });
  if (!isAdmin) {
    query = query.eq('user_id', auth.user.id);
  }
  const { data, error } = await query;
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { orders: data || [] } });
});

router.get('/orders/:id', async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const isAdmin = auth.profile?.role === 'admin';
  const { data, error } = await db.from('orders').select('*, items:order_items(*)').eq('id', req.params.id).maybeSingle();
  if (error || !data) { send(res, 404, { success: false, message: 'Commande introuvable.' }); return; }
  if (!isAdmin && data.user_id !== auth.user.id) {
    send(res, 403, { success: false, message: 'Accès non autorisé à cette commande.' });
    return;
  }
  send(res, 200, { success: true, data: { order: data } });
});

router.patch('/orders/:id/cancel', async (req, res) => {
  const auth = await requireUser(req, res);
  if (!auth) return;
  const { reason } = req.body;
  const isAdmin = auth.profile?.role === 'admin';
  const { data: order } = await db.from('orders').select('user_id').eq('id', req.params.id).maybeSingle();
  if (!order) { send(res, 404, { success: false, message: 'Commande introuvable.' }); return; }
  if (!isAdmin && order.user_id !== auth.user.id) {
    send(res, 403, { success: false, message: 'Non autorisé.' });
    return;
  }
  const { error } = await db
    .from('orders')
    .update({ status: 'Annulée', cancel_reason: reason || 'Annulé par le client', cancelled_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true });
});

// ─── ROUTES ADMINISTRATION (Vérification rôle admin stricte) ─────────────────
router.get('/admin/dashboard', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  try {
    const [pRes, oRes, uRes] = await Promise.all([
      db.from('products').select('count', { count: 'exact', head: true }),
      db.from('orders').select('id, status, total_amount, created_at'),
      db.from('profiles').select('count', { count: 'exact', head: true }).neq('role', 'admin'),
    ]);
    const orders = oRes.data || [];
    const stats = {
      totalProducts: pRes.count || 0,
      totalOrders: orders.length,
      totalClients: uRes.count || 0,
      pendingQuotes: orders.filter((o) => o.status === 'En attente de chiffrage').length,
      confirmedOrders: orders.filter((o) => o.status === 'Confirmée').length,
    };
    send(res, 200, { success: true, data: { stats } });
  } catch (err) {
    send(res, 500, { success: false, message: err.message });
  }
});

router.get('/admin/analytics', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data: orders, error } = await db.from('orders').select('status, total_amount, created_at');
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { orders: orders || [] } });
});

router.get('/admin/products', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { category, search, limit = 200, offset = 0 } = req.query;
  let query = db.from('products').select('*', { count: 'exact' });
  if (category) query = query.eq('category', String(category));
  if (search) query = query.or(`name.ilike.%${search}%,reference.ilike.%${search}%`);
  query = query.order('name').range(Number(offset), Number(offset) + Number(limit) - 1);
  const { data, count, error } = await query;
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { products: data || [], total: count || (data || []).length } });
});

router.post('/admin/products', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data, error } = await db.from('products').insert(req.body).select().single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 201, { success: true, data: { product: data } });
});

router.put('/admin/products/:id', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data, error } = await db.from('products').update(req.body).eq('id', req.params.id).select().single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { product: data } });
});

router.delete('/admin/products/:id', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { error } = await db.from('products').delete().eq('id', req.params.id);
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true });
});

router.get('/admin/orders', async (req, res) => {
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

router.get('/admin/orders/:id/pricing', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data: order, error } = await db.from('orders').select('*, items:order_items(*)').eq('id', req.params.id).maybeSingle();
  if (error || !order) { send(res, 404, { success: false, message: 'Commande introuvable.' }); return; }
  const total = (order.items || []).reduce((acc, it) => acc + (Number(it.unit_price) || 0) * (Number(it.quantity) || 1), 0);
  send(res, 200, { success: true, data: { order, pricingSummary: { totalAmount: total, currency: 'FCFA' } } });
});

router.post('/admin/orders/:id/save-pricing', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { items } = req.body;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it.productId) {
        await db.from('order_items').update({ unit_price: it.unit_price }).eq('order_id', req.params.id).eq('product_id', it.productId);
      }
    }
  }
  const { data: order } = await db.from('orders').select('*, items:order_items(*)').eq('id', req.params.id).maybeSingle();
  send(res, 200, { success: true, data: { order } });
});

router.post('/admin/orders/:id/validate-pricing', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { items } = req.body;
  let total = 0;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it.productId) {
        await db.from('order_items').update({ unit_price: it.unit_price }).eq('order_id', req.params.id).eq('product_id', it.productId);
        total += (Number(it.unit_price) || 0) * (Number(it.quantity) || 1);
      }
    }
  }
  const now = new Date().toISOString();
  await db.from('orders').update({ status: 'Devis envoyé', total_amount: total, updated_at: now }).eq('id', req.params.id);
  await db.from('order_status_history').insert({
    order_id: req.params.id,
    status: 'Devis envoyé',
    note: `Devis validé (${total} FCFA)`,
    changed_by: adminId,
  });
  const { data: order } = await db.from('orders').select('*, items:order_items(*)').eq('id', req.params.id).maybeSingle();
  send(res, 200, { success: true, data: { order } });
});

const handleOrderStatusChange = async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { id } = req.params;
  const { status, note } = req.body;
  if (!status) { send(res, 400, { success: false, message: 'Champ "status" requis.' }); return; }

  const now = new Date().toISOString();
  const { error } = await db.from('orders').update({ status, updated_at: now }).eq('id', id);
  if (error) { send(res, 500, { success: false, message: error.message }); return; }

  await db.from('order_status_history').insert({
    order_id: id,
    status,
    note: note || null,
    changed_by: adminId,
  });
  send(res, 200, { success: true });
};
router.patch('/admin/orders/:id/status', handleOrderStatusChange);
router.put('/admin/orders/:id/status', handleOrderStatusChange);

router.get('/admin/users', async (req, res) => {
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

router.patch('/admin/users/:id/status', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { status } = req.body;
  const { error } = await db.from('profiles').update({ status }).eq('id', req.params.id);
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true });
});

router.patch('/admin/users/:id/phone', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { phone } = req.body;
  const { error } = await db.from('profiles').update({ phone }).eq('id', req.params.id);
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { phone, normalized: phone } });
});

router.get('/admin/reminders/templates', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data, error } = await db.from('reminder_templates').select('*').order('is_default', { ascending: false });
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { templates: data || [] } });
});

router.put('/admin/reminders/templates/:key', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { content, title } = req.body;
  const updatePayload = { content, updated_at: new Date().toISOString() };
  if (title) updatePayload.title = title;
  const { error } = await db.from('reminder_templates').update(updatePayload).eq('template_key', req.params.key);
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true });
});

router.get('/admin/reminders', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data, error } = await db.from('client_reminders').select('*').order('opened_at', { ascending: false });
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { reminders: data || [] } });
});

router.post('/admin/reminders', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { userId, templateKey } = req.body;
  const { data, error } = await db.from('client_reminders').insert({
    user_id: String(userId),
    template_key: templateKey,
    channel: 'whatsapp_manuel',
    opened_by: adminId,
    status: 'opened',
    opened_at: new Date().toISOString(),
  }).select().single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 201, { success: true, data: { reminder: data } });
});

router.post('/admin/reminders/:id/confirm', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const now = new Date().toISOString();
  const { data, error } = await db.from('client_reminders').update({ status: 'confirmed', confirmed_at: now }).eq('id', req.params.id).select().single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  if (data?.user_id) {
    await db.from('profiles').update({ last_reminder_at: now }).eq('id', data.user_id);
  }
  send(res, 200, { success: true, data: { reminder: data } });
});

router.post('/admin/reminders/:id/cancel', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data, error } = await db.from('client_reminders').update({ status: 'cancelled' }).eq('id', req.params.id).select().single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { reminder: data } });
});

router.post('/admin/check-inactivity', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: newlyInactive, error } = await db
    .from('profiles')
    .update({ status: 'inactive' })
    .neq('role', 'admin')
    .eq('status', 'active')
    .lt('created_at', sixtyDaysAgo)
    .select();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { newlyInactive: newlyInactive || [], relancesSent: [] } });
});

router.get('/admin/relances', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data, error } = await db.from('relance_logs').select('*').order('created_at', { ascending: false });
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 200, { success: true, data: { relances: data || [] } });
});

router.post('/admin/users/:id/relance', async (req, res) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { subject, message, channel = 'whatsapp_manuel' } = req.body;
  const { data: profile } = await db.from('profiles').select('*').eq('id', req.params.id).maybeSingle();
  const { data: log, error } = await db.from('relance_logs').insert({
    user_id: req.params.id,
    establishment_name: profile?.establishment_name || '',
    channel,
    subject: subject || 'Relance client CYM Pharma',
    message: message || '',
    status: 'sent',
    trigger_reason: 'manual_admin',
  }).select().single();
  if (error) { send(res, 500, { success: false, message: error.message }); return; }
  send(res, 201, { success: true, data: { relance: log, user: profile } });
});

// ─── Double montage du routeur : accessible sous /api/... ET /... ─────────────
app.use('/api', router);
app.use('/', router);

// Notifications WhatsApp admin (wa.me)
async function notifyNewOrder(order) {
  const phones = [
    process.env.WHATSAPP_ADMIN_PHONE_1 || '2250707079746',
    process.env.WHATSAPP_ADMIN_PHONE_2 || '2250707729846',
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
    console.log(`[WhatsApp Order Alert] → ${url}`);
  }

  await db.from('relance_logs').insert({
    user_id: order.user_id || null,
    establishment_name: order.establishment_name || '',
    channel: 'whatsapp_auto',
    subject: `Nouvelle commande ${order.order_number || order.id}`,
    message: msg,
    trigger_reason: 'new_order',
    status: 'pending',
  }).then(({ error }) => {
    if (error) console.warn('[CYM] relance_log insert notice:', error.message);
  });
}

// 404 & 500 globaux
app.use((_req, res) => send(res, 404, { success: false, message: 'Route introuvable sur le serveur CYM Pharma.' }));
app.use((err, _req, res, _next) => {
  console.error('[CYM SERVER ERROR]', err?.message || err);
  send(res, 500, { success: false, message: 'Erreur interne du serveur.' });
});

// Démarrage
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ CYM Pharma API démarrée avec succès sur le port ${PORT}`);
  console.log(`   Frontend CORS autorisé : ${FRONTEND_URL}`);
  console.log(`   Supabase Endpoint       : ${SUPABASE_URL}`);
});
