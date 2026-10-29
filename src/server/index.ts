/**
 * CYM Pharma — Serveur Express Production (Render)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce fichier est le point d'entrée du backend Node.js/Express hébergé sur Render.
 * Il ne contient JAMAIS de clé service_role exposée au frontend.
 *
 * Architecture :
 *  - CORS strict : autorise InfinityFree (VITE_FRONTEND_URL) et localhost:3000
 *  - Routes :
 *      GET  /api/health              → Santé serveur + connectivité Supabase
 *      POST /api/orders              → Création commande atomique (RPC)
 *      POST /api/orders/:id/notify   → Notification WhatsApp (log wa.me uniquement)
 *      POST /api/contact             → Formulaire de contact → Supabase
 *      POST /api/reminders/check     → Marque les clients inactifs (pg_cron backup)
 *  - Rate-limiting : 120 req/min global
 *  - Ne renvoie jamais ref_price, price ni stocks dans les réponses publiques
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
const FRONTEND_URL = (process.env.VITE_FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[CYM SERVER] Variables d\'environnement manquantes : SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Application Express ──────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '2mb' }));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || '';
  const allowed = [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'];
  if (allowed.some((o) => origin === o) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── Rate limiter simple ───────────────────────────────────────────────────────
const rateMap = new Map<string, { count: number; reset: number }>();
app.use((req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || entry.reset < now) { rateMap.set(ip, { count: 1, reset: now + 60_000 }); next(); return; }
  if (entry.count >= 120) { res.status(429).json({ success: false, message: 'Trop de requêtes.' }); return; }
  entry.count++;
  next();
});

function json(res: Response, code: number, payload: object) { res.status(code).json(payload); }

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) { json(res, 401, { success: false, message: 'Authentification requise.' }); return null; }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) { json(res, 401, { success: false, message: 'Token invalide.' }); return null; }
  const { data: profile } = await supabaseAdmin.from('profiles').select('role, status').eq('id', data.user.id).maybeSingle();
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
    json(res, 403, { success: false, message: 'Privilèges administrateur requis.' }); return null;
  }
  return data.user.id;
}

// ─── GET /api/health ──────────────────────────────────────────────────────────
app.get('/api/health', async (_req: Request, res: Response) => {
  const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
  json(res, error ? 503 : 200, {
    success: !error, status: error ? 'degraded' : 'ok',
    db: !error, server: 'CYM Pharma API', ts: new Date().toISOString(),
  });
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
app.post('/api/orders', async (req: Request, res: Response) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  let userId: string | null = null;
  if (token) { const { data } = await supabaseAdmin.auth.getUser(token); userId = data?.user?.id || null; }

  const { items, establishment_name, shipping_address, shipping_city, notes } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    json(res, 400, { success: false, message: 'La commande doit comporter au moins un article.' }); return;
  }
  for (const it of items) {
    if (!it.name || !it.quantity || Number(it.quantity) <= 0) {
      json(res, 400, { success: false, message: 'Article invalide : nom ou quantité manquante.' }); return;
    }
  }
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('create_order_atomic', {
    p_order_data: { user_id: userId, establishment_name, shipping_address, shipping_city, notes },
    p_items: items,
  });
  if (rpcError) { json(res, 500, { success: false, message: rpcError.message }); return; }
  if (!rpcResult?.order) { json(res, 500, { success: false, message: 'Commande non enregistrée.' }); return; }

  notifyNewOrder(rpcResult.order).catch((e) => console.warn('[CYM] Notif WhatsApp non-bloquante:', e?.message));
  json(res, 201, { success: true, data: { order: rpcResult.order } });
});

// ─── POST /api/contact ────────────────────────────────────────────────────────
app.post('/api/contact', async (req: Request, res: Response) => {
  const { name, email, subject, message, phone, org } = req.body;
  if (!name || !email || !message) { json(res, 400, { success: false, message: 'Champs requis manquants.' }); return; }
  const { error } = await supabaseAdmin.from('contact_messages').insert({ name, email, phone: phone || null, org: org || null, subject: subject || 'Contact site', message });
  json(res, error ? 500 : 201, { success: !error, message: error ? error.message : 'Message envoyé.' });
});

// ─── POST /api/reminders/check [ADMIN] ────────────────────────────────────────
app.post('/api/reminders/check', async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data, error } = await supabaseAdmin.rpc('mark_inactive_clients');
  json(res, error ? 500 : 200, { success: !error, data: data || null, message: error?.message });
});

// ─── GET /api/admin/orders [ADMIN] ────────────────────────────────────────────
app.get('/api/admin/orders', async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { data, error } = await supabaseAdmin.from('orders').select('*, items:order_items(*)').order('created_at', { ascending: false });
  json(res, error ? 500 : 200, { success: !error, data: { orders: data || [] }, message: error?.message });
});

// ─── PATCH /api/admin/orders/:id/status [ADMIN] ───────────────────────────────
app.patch('/api/admin/orders/:id/status', async (req: Request, res: Response) => {
  const adminId = await requireAdmin(req, res);
  if (!adminId) return;
  const { id } = req.params;
  const { status, note } = req.body;
  if (!status) { json(res, 400, { success: false, message: 'Le champ status est requis.' }); return; }
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('orders').update({ status, updated_at: now }).eq('id', id);
  if (error) { json(res, 500, { success: false, message: error.message }); return; }
  await supabaseAdmin.from('order_status_history').insert({ order_id: id, status, note: note || null, changed_by: adminId });
  json(res, 200, { success: true });
});

// ─── Notification WhatsApp (wa.me logs) ───────────────────────────────────────
async function notifyNewOrder(order: any): Promise<void> {
  const phone1 = (process.env.WHATSAPP_ADMIN_PHONE_1 || '2250707079746').replace(/\D/g, '');
  const phone2 = (process.env.WHATSAPP_ADMIN_PHONE_2 || '2250707729846').replace(/\D/g, '');
  const msg = `*CYM Pharma* - Nouvelle commande\nN° : ${order.order_number}\nEtablissement : ${order.establishment_name || 'N/A'}\nArticles : ${(order.items || []).length}\nDate : ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan' })}`;
  for (const phone of [phone1, phone2].filter(Boolean)) {
    console.log(`[WhatsApp] Admin alert → https://wa.me/${phone}?text=${encodeURIComponent(msg)}`);
  }
  await supabaseAdmin.from('relance_logs').insert({
    user_id: order.user_id || null, establishment_name: order.establishment_name || '',
    channel: 'whatsapp_auto', subject: `Nouvelle commande ${order.order_number}`,
    message: msg, trigger_reason: 'new_order', status: 'pending',
  }).then(({ error }) => { if (error) console.warn('[CYM] relance_log error:', error.message); });
}

// ─── 404 / Error handlers ─────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => json(res, 404, { success: false, message: 'Route introuvable.' }));
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[CYM SERVER]', err.message);
  json(res, 500, { success: false, message: 'Erreur interne du serveur.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CYM Pharma API demarree - port ${PORT} | Frontend: ${FRONTEND_URL}`);
});

export default app;
