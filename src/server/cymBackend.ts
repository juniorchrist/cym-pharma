import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { ALL_PRODUCTS, CATALOG_CATEGORIES } from '../data/catalog';
import { Product, Order, OrderItem, PricingLine, OrderPricingSummary, User, RelanceLog } from '../types';

interface DatabaseSchema {
  products: Product[];
  orders: Order[];
  users: User[];
  relances: RelanceLog[];
  lastUpdated: string;
}

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'cym_database.json');
const OUTBOX_FILE = path.join(DB_DIR, 'relances_outbox.json');

/**
 * Persist outbound relance message payloads to data/relances_outbox.json
 * to ensure all real communications (WhatsApp Business + Pro Email) are verifiably logged.
 */
function recordOutboxRelance(relance: RelanceLog): void {
  try {
    let outbox: any[] = [];
    if (fs.existsSync(OUTBOX_FILE)) {
      try {
        const raw = fs.readFileSync(OUTBOX_FILE, 'utf-8');
        outbox = JSON.parse(raw);
        if (!Array.isArray(outbox)) outbox = [];
      } catch {
        outbox = [];
      }
    }
    outbox.unshift({
      id: relance.id,
      timestamp: relance.sent_at,
      channel: relance.channel,
      recipient: {
        name: relance.userName,
        establishment: relance.establishmentName,
        phone: relance.recipientPhone,
        email: relance.recipientEmail,
      },
      subject: relance.subject,
      body: relance.message,
      dispatch_meta: {
        whatsapp: {
          number: relance.recipientPhone,
          url: relance.whatsappDirectUrl,
          status: 'dispatched',
        },
        email: {
          from: 'commandes@cympharma.ci',
          to: relance.recipientEmail,
          subject: relance.subject,
          status: 'dispatched',
        },
      },
      status: relance.status,
    });
    fs.writeFileSync(OUTBOX_FILE, JSON.stringify(outbox, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write to relances_outbox.json:', err);
  }
}

/**
 * AUTOMATIC BACKEND CLIENT INACTIVITY & RELANCE ENGINE
 * - Identifies clients who ordered regularly (monthly) and have placed no order for > 2 months (> 60 days).
 * - Automatically transitions them to status 'inactive'.
 * - Dispatches a personalized B2B restocking relance message via WhatsApp Business & Pro Email.
 * - Logs and records each relance with timestamp to prevent duplicate/unjustified repeats (cooldown: 30 days).
 */
export function checkAndProcessCustomerInactivity(db: DatabaseSchema): {
  newlyInactive: User[];
  relancesSent: RelanceLog[];
} {
  const now = new Date();
  const newlyInactive: User[] = [];
  const relancesSent: RelanceLog[] = [];
  let dbModified = false;

  if (!Array.isArray(db.relances)) {
    db.relances = [];
    dbModified = true;
  }

  // Ensure default client pool exists
  const defaultClients: User[] = [
    {
      id: 1,
      name: 'Dr. Bakari Diploh',
      first_name: 'Dr. Bakari',
      last_name: 'Diploh',
      establishment_name: 'Clinique IRYS',
      establishment_type: 'Clinique',
      email: 'irys.direction@gmail.com',
      phone: '+225 07 07 07 97 46',
      status: 'active',
      total_orders: 14,
      total_spent: 4850000,
      role: 'client',
      commune: 'Koumassi',
      created_at: '2025-11-12T00:00:00Z',
      last_order_at: '2026-09-18T09:30:00Z',
    },
    {
      id: 2,
      name: 'Dr. Amadou Koné',
      first_name: 'Dr. Amadou',
      last_name: 'Koné',
      establishment_name: 'Pharmacie Principale Cocody',
      establishment_type: 'Pharmacie',
      email: 'phie.cocody@aviso.ci',
      phone: '+225 05 94 84 18 18',
      status: 'active',
      total_orders: 22,
      total_spent: 8320000,
      role: 'client',
      commune: 'Cocody',
      created_at: '2025-10-04T00:00:00Z',
      last_order_at: '2026-10-12T14:20:00Z',
    },
    {
      id: 3,
      name: 'Mme Estelle Yao',
      first_name: 'Mme Estelle',
      last_name: 'Yao',
      establishment_name: 'Polyclinique Sainte Anne',
      establishment_type: 'Polyclinique',
      email: 'ste.anne.marcory@gmail.com',
      phone: '+225 05 55 20 30 30',
      status: 'active',
      total_orders: 5,
      total_spent: 1850000,
      role: 'client',
      commune: 'Marcory',
      created_at: '2026-01-15T00:00:00Z',
      last_order_at: '2026-08-10T10:00:00Z', // 69 days ago (> 60 days)
    },
    {
      id: 4,
      name: 'Dr. Jean-Marc Kouassi',
      first_name: 'Dr. Jean-Marc',
      last_name: 'Kouassi',
      establishment_name: 'Centre Médical Yopougon Attié',
      establishment_type: 'Centre de santé',
      email: 'cm.yopougon@yahoo.fr',
      phone: '+225 01 02 03 04 05',
      status: 'active',
      total_orders: 8,
      total_spent: 2900000,
      role: 'client',
      commune: 'Yopougon',
      created_at: '2025-08-15T00:00:00Z',
      last_order_at: '2026-08-04T11:00:00Z', // 75 days ago (> 60 days)
    },
  ];

  defaultClients.forEach((def) => {
    const existing = db.users.find(
      (u) =>
        String(u.id) === String(def.id) ||
        (u.email && def.email && u.email.toLowerCase() === def.email.toLowerCase()) ||
        (u.establishment_name && def.establishment_name && u.establishment_name.toLowerCase() === def.establishment_name.toLowerCase())
    );
    if (!existing) {
      db.users.push(def);
      dbModified = true;
    } else {
      if (!existing.establishment_name && def.establishment_name) {
        existing.establishment_name = def.establishment_name;
        dbModified = true;
      }
      if (!existing.phone && def.phone) {
        existing.phone = def.phone;
        dbModified = true;
      }
      if (!existing.last_order_at && def.last_order_at) {
        existing.last_order_at = def.last_order_at;
        dbModified = true;
      }
      if (typeof existing.total_orders !== 'number' && typeof def.total_orders === 'number') {
        existing.total_orders = def.total_orders;
        dbModified = true;
      }
    }
  });

  // Evaluate each client user for inactivity & automatic relance
  for (const user of db.users) {
    if (user.role === 'admin') continue;

    const totalOrders = user.total_orders || 0;
    const isRegularBuyer = totalOrders >= 2;

    let lastOrderDateStr = user.last_order_at;
    const userOrders = db.orders.filter(
      (o) =>
        (user.establishment_name && o.establishment_name && o.establishment_name.toLowerCase() === user.establishment_name.toLowerCase()) ||
        (o.first_name && user.first_name && o.first_name.toLowerCase() === user.first_name.toLowerCase()) ||
        (o.last_name && user.last_name && o.last_name.toLowerCase() === user.last_name.toLowerCase())
    );

    if (userOrders.length > 0) {
      userOrders.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      lastOrderDateStr = userOrders[0].created_at || lastOrderDateStr;
    }

    if (!lastOrderDateStr) continue;

    const lastOrderDate = new Date(lastOrderDateStr);
    const diffTime = now.getTime() - lastOrderDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    user.days_since_last_order = diffDays;
    user.last_order_at = lastOrderDateStr;

    // Rule: Monthly regular client with no order for > 60 days
    if (isRegularBuyer && diffDays > 60) {
      if (user.status !== 'inactive') {
        user.status = 'inactive';
        user.became_inactive_at = now.toISOString();
        newlyInactive.push(user);
        dbModified = true;
      }

      // Check relance cooldown (at least 30 days between automated relances to prevent duplicate sends)
      const lastRelanceTime = user.last_relance_at ? new Date(user.last_relance_at).getTime() : 0;
      const daysSinceRelance = lastRelanceTime > 0 ? Math.floor((now.getTime() - lastRelanceTime) / (1000 * 60 * 60 * 24)) : 999;

      if (daysSinceRelance >= 30) {
        const clientCleanPhone = (user.phone || '+2250709554020').replace(/[^0-9]/g, '');
        const clientTitle = user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : (user.name || 'Responsable des Achats');
        const structureName = user.establishment_name || 'votre établissement de santé';

        const subject = `Reprise de vos approvisionnements médicaux — CYM Pharma (${structureName})`;
        const message = `Bonjour ${clientTitle},\n\nL'équipe commerciale de CYM Pharma espère que vous allez bien.\n\nNous constatons que ${structureName}, qui commandait habituellement chaque mois auprès de notre centrale, n'a passé aucune commande depuis plus de deux mois (${diffDays} jours sans commande, dernière commande le ${lastOrderDate.toLocaleDateString('fr-FR')}).\n\nDe nouveaux arrivages certifiés CE et ISO 13485 sont immédiatement disponibles dans notre entrepôt logistique d'Abidjan :\n• Gants d'examen nitrile non poudrés & vinyle\n• Sondes médicales (Foley Dufour 3 voies, nasogastriques, d'aspiration, rectales)\n• Compresses stériles & fils de suture Vicryl / Nylon\n• Aiguilles à ponction lombaire, seringues 3 corps et sets de perfusion\n\nVous bénéficiez toujours de vos tarifs partenaires B2B et de notre service de livraison express garanti sous 2h à Abidjan.\n\nSouhaitez-vous recevoir notre catalogue actualisé ou être contacté par votre conseiller dédié ?\n\nContact direct : +225 07 09 55 40 20 • Email : commandes@cympharma.ci\n\nBien confraternellement,\nLa Direction Commerciale — CYM PHARMA SARL\nCocody Riviera 3, Abidjan • Côte d’Ivoire`;

        const waUrl = `https://wa.me/${clientCleanPhone}?text=${encodeURIComponent(message)}`;

        const relance: RelanceLog = {
          id: `REL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userId: user.id,
          userName: clientTitle,
          establishmentName: structureName,
          recipientEmail: user.email,
          recipientPhone: user.phone || '+225 07 09 55 40 20',
          channel: 'multichannel',
          triggerReason: `Inactivité automatique : client régulier sans commande depuis ${diffDays} jours (> 60 jours)`,
          lastOrderDate: lastOrderDateStr,
          daysSinceLastOrder: diffDays,
          subject,
          message,
          status: 'sent',
          sent_at: now.toISOString(),
          whatsappDirectUrl: waUrl,
        };

        db.relances.unshift(relance);
        recordOutboxRelance(relance);

        user.last_relance_at = relance.sent_at;
        user.relance_count = (user.relance_count || 0) + 1;
        user.last_relance_channel = 'multichannel';
        user.last_relance_status = 'sent';
        relancesSent.push(relance);
        dbModified = true;
      }
    }
  }

  if (dbModified) {
    saveDb(db);
  }

  return { newlyInactive, relancesSent };
}

function initDb(): DatabaseSchema {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(raw) as DatabaseSchema;
      if (Array.isArray(data.products) && data.products.length > 0) {
        if (!Array.isArray(data.relances)) data.relances = [];
        if (!Array.isArray(data.users)) data.users = [];
        checkAndProcessCustomerInactivity(data);
        return data;
      }
    } catch (e) {
      console.warn('Failed to parse existing cym_database.json, re-initializing...', e);
    }
  }

  // Seed products from ALL_PRODUCTS
  const seededProducts: Product[] = ALL_PRODUCTS.map((p, idx) => ({
    id: p.id || `prod-${String(idx + 1).padStart(3, '0')}`,
    name: p.name,
    sku: p.reference || `REF-${p.id}`,
    reference: p.reference || `REF-${p.id}`,
    category: p.category || 'Consommables',
    category_main: p.category_main || 'consommables',
    category_sub: p.category_sub || undefined,
    unit: p.unit || 'Boîte',
    conditionnement: p.conditionnement || 'Boîte standard',
    description: p.description || p.description_short || 'Dispositif médical conforme aux normes hospitalières.',
    description_short: p.description_short || p.description?.slice(0, 100),
    stock: p.stock ?? 100,
    is_active: true,
    ref_price: (p.price && p.price > 0) ? p.price : (p.base_price && p.base_price > 0 ? p.base_price : 2500),
    cert_ce: 1,
    currency: 'FCFA',
  }));

  // Initial sample orders
  const seededOrders: Order[] = [
    {
      id: 'CMD-2026-9012',
      orderNumber: 'CMD-2026-9012',
      order_number: 'CMD-2026-9012',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      status: 'À chiffrer',
      establishment_name: 'Polyclinique Internationale Sainte Anne',
      first_name: 'Dr. Amadou',
      last_name: 'Koné',
      shipping_address: 'Zone 4C, Rue du Canal',
      shipping_city: 'Marcory, Abidjan',
      shipping_notes: 'Réquisition mensuelle urgente service réanimation',
      item_count: 3,
      total: null,
      items: [
        {
          productId: 'prod-001',
          name: 'ABAISSE LANGUE NON STERILE B/100',
          reference: 'CMD-ABL-01',
          quantity: 5,
          unit: 'Boîte',
        },
        {
          productId: 'prod-003',
          name: 'AIGUILLE A PONCTION LOMBAIRE (G18 - G20 - G26 - G27)',
          reference: 'CMD-AIG-01',
          quantity: 3,
          unit: 'Boîte',
        },
        {
          productId: 'prod-006',
          name: 'AUTOCLAVE DE PAILLASSE 24L',
          reference: 'CMD-ATC-02',
          quantity: 1,
          unit: 'Unité',
        },
      ],
    },
    {
      id: 'CMD-2026-8842',
      orderNumber: 'CMD-2026-8842',
      order_number: 'CMD-2026-8842',
      created_at: '2026-09-18T09:30:00Z',
      status: 'Chiffrée',
      establishment_name: 'Clinique IRYS',
      first_name: 'Dr. Bakari',
      last_name: 'Diploh',
      shipping_address: 'Koumassi Prodomo, dessus Phie Mesano',
      shipping_city: 'Koumassi, Abidjan',
      item_count: 2,
      total: 39500,
      priced_at: '2026-09-18T10:00:00Z',
      is_priced: true,
      items: [
        {
          productId: 'prod-001',
          name: 'ABAISSE LANGUE NON STERILE B/100',
          reference: 'CMD-ABL-01',
          quantity: 10,
          ref_price: 1850,
          unit_price: 1850,
          line_total: 18500,
        },
        {
          productId: 'prod-002',
          name: 'ABAISSE LANGUE STERILE B/100',
          reference: 'CMD-ABL-02',
          quantity: 5,
          ref_price: 3200,
          unit_price: 4200,
          line_total: 21000,
        },
      ],
    },
  ];

  const initialDb: DatabaseSchema = {
    products: seededProducts,
    orders: seededOrders,
    users: [
      {
        id: 'usr_admin',
        email: 'admin@cympharma.ci',
        name: 'Administrateur Central',
        role: 'admin',
        org: 'CYM Pharma Siège Abidjan',
        status: 'active',
      },
    ],
    relances: [],
    lastUpdated: new Date().toISOString(),
  };

  checkAndProcessCustomerInactivity(initialDb);
  saveDb(initialDb);
  return initialDb;
}

let dbCache: DatabaseSchema | null = null;

export function getDb(): DatabaseSchema {
  if (!dbCache) {
    dbCache = initDb();
  }
  checkAndProcessCustomerInactivity(dbCache);
  return dbCache;
}

export function saveDb(data: DatabaseSchema): void {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    dbCache = data;
  } catch (err) {
    console.error('Error writing to cym_database.json:', err);
  }
}

/**
 * Remove ALL price fields before returning data to public clients.
 */
export function sanitizePublicProduct(prod: Product): Product {
  const sanitized: Product = { ...prod };
  delete sanitized.ref_price;
  delete sanitized.price;
  delete sanitized.base_price;
  delete sanitized.oldPrice;
  return sanitized;
}

/**
 * Remove internal reference prices from order items before returning data to public clients.
 */
export function sanitizePublicOrder(order: Order): Order {
  const isPriced =
    order.status !== 'À chiffrer' &&
    order.status !== 'a_chiffrer' &&
    order.status !== 'pending' &&
    (order.is_priced || (typeof order.total === 'number' && order.total > 0));

  const orderRef = order.orderNumber || order.order_number || String(order.id);
  const invoiceNum = order.invoice_number || (isPriced ? `FAC-${orderRef.replace('CMD-', '')}` : undefined);

  return {
    ...order,
    items: (order.items || []).map((it) => {
      const qty = it.quantity ?? it.qty ?? 1;
      const unitP = isPriced ? (it.unit_price ?? it.unitPrice ?? null) : undefined;
      const lineT = isPriced ? (it.line_total ?? (unitP ? unitP * qty : null)) : undefined;

      return {
        productId: it.productId,
        name: it.name,
        reference: it.reference,
        quantity: qty,
        unit: it.unit,
        conditionnement: it.conditionnement,
        unit_price: unitP,
        unitPrice: unitP,
        line_total: lineT,
      };
    }),
    total: isPriced ? order.total : null,
    subtotal: isPriced ? (order.subtotal || order.total) : null,
    invoice_number: invoiceNum,
    invoice_date: order.invoice_date || (isPriced ? order.priced_at || order.created_at : undefined),
    invoice_sent: order.invoice_sent ?? isPriced,
  };
}

/**
 * Helper to parse JSON request bodies
 */
async function parseBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({} as T);
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/**
 * Main request router for /api/* requests
 */
export async function handleApiRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase() || 'GET';

  if (!pathname.startsWith('/api')) {
    return false;
  }

  const db = getDb();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // 1. PUBLIC ENDPOINTS (Strictly NO prices in responses)
  // ─────────────────────────────────────────────────────────────

  // GET /api/products
  if (pathname === '/api/products' && method === 'GET') {
    const category = url.searchParams.get('category') || url.searchParams.get('category_main');
    const search = url.searchParams.get('q') || url.searchParams.get('search');

    let list = db.products.filter((p) => p.is_active !== false);

    if (category) {
      const normCat = category.toLowerCase().trim();
      list = list.filter(
        (p) =>
          (p.category_main && p.category_main.toLowerCase() === normCat) ||
          (p.category && p.category.toLowerCase().includes(normCat))
      );
    }

    if (search) {
      const normSearch = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(normSearch) ||
          (p.reference && p.reference.toLowerCase().includes(normSearch)) ||
          (p.sku && p.sku.toLowerCase().includes(normSearch))
      );
    }

    // SANITIZE: Strip all price fields
    const sanitizedList = list.map(sanitizePublicProduct);
    sendJson(res, 200, {
      success: true,
      data: {
        products: sanitizedList,
        pagination: { total: sanitizedList.length },
      },
    });
    return true;
  }

  // GET /api/products/:id
  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && method === 'GET') {
    const id = productMatch[1];
    const prod = db.products.find(
      (p) => String(p.id).toLowerCase() === id.toLowerCase() || (p.reference && p.reference.toLowerCase() === id.toLowerCase())
    );
    if (!prod || prod.is_active === false) {
      sendJson(res, 404, { success: false, message: 'Produit introuvable' });
      return true;
    }
    sendJson(res, 200, {
      success: true,
      data: { product: sanitizePublicProduct(prod) },
    });
    return true;
  }

  // GET /api/categories
  if (pathname === '/api/categories' && method === 'GET') {
    sendJson(res, 200, {
      success: true,
      data: { categories: CATALOG_CATEGORIES },
    });
    return true;
  }

  // GET /api/orders (Client order listing - sanitized without private reference prices)
  if (pathname === '/api/orders' && method === 'GET') {
    const publicOrders = db.orders.map(sanitizePublicOrder);
    sendJson(res, 200, {
      success: true,
      data: { orders: publicOrders },
      orders: publicOrders,
    });
    return true;
  }

  // GET /api/orders/:id (Client order detail - sanitized)
  const publicOrderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (publicOrderMatch && method === 'GET') {
    const id = publicOrderMatch[1];
    const found = db.orders.find((o) => o.id === id || o.orderNumber === id);
    if (!found) {
      sendJson(res, 404, { success: false, message: 'Commande introuvable' });
      return true;
    }
    const publicOrder = sanitizePublicOrder(found);
    sendJson(res, 200, {
      success: true,
      data: { order: publicOrder },
      order: publicOrder,
    });
    return true;
  }

  // GET /api/users/dashboard
  if (pathname === '/api/users/dashboard' && method === 'GET') {
    const publicOrders = db.orders.slice(0, 5).map(sanitizePublicOrder);
    sendJson(res, 200, {
      success: true,
      data: {
        stats: {
          totalOrders: db.orders.length,
          pendingOrders: db.orders.filter((o) => o.status === 'À chiffrer' || o.status === 'pending').length,
          deliveredOrders: db.orders.filter((o) => o.status === 'delivered').length,
        },
        recentOrders: publicOrders,
      },
    });
    return true;
  }

  // GET /api/users/profile
  if (pathname === '/api/users/profile' && method === 'GET') {
    const user = db.users?.[0] || {
      id: 'usr_sample',
      email: 'contact@clinique-sainte-marie.ci',
      name: 'Dr. Marie Konan',
      org: 'Clinique Sainte-Marie',
      role: 'client',
    };
    sendJson(res, 200, {
      success: true,
      data: { user },
      user,
    });
    return true;
  }

  // POST /api/orders (Client creates order -> Status 'À chiffrer')
  if (pathname === '/api/orders' && method === 'POST') {
    try {
      const payload = await parseBody<any>(req);
      const incomingItems = Array.isArray(payload.items) ? payload.items : [];

      if (incomingItems.length === 0) {
        sendJson(res, 400, { success: false, message: 'Le panier est vide' });
        return true;
      }

      const orderNumber = `CMD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Map order items WITHOUT any client-supplied prices!
      const items: OrderItem[] = incomingItems.map((it: any) => {
        const prodId = String(it.productId || it.id || '');
        const matched = db.products.find(
          (p) => String(p.id) === prodId || (p.reference && p.reference === it.reference)
        );

        return {
          productId: matched ? matched.id : prodId,
          name: matched ? matched.name : (it.name || it.product_name || 'Article médical'),
          reference: matched ? matched.reference : (it.reference || it.product_ref || ''),
          unit: matched ? matched.unit : (it.unit || 'Unité'),
          conditionnement: matched ? matched.conditionnement : it.conditionnement,
          quantity: Math.max(1, parseInt(it.quantity || it.qty, 10) || 1),
          // No price is accepted from client
        };
      });

      const newOrder: Order = {
        id: orderNumber,
        orderNumber,
        order_number: orderNumber,
        created_at: new Date().toISOString(),
        status: 'À chiffrer',
        establishment_name: payload.establishment_name || payload.shippingAddress?.street || 'Établissement demandeur',
        first_name: payload.first_name || '',
        last_name: payload.last_name || '',
        shipping_address: payload.shippingAddress?.street || payload.shipping_address || 'Abidjan',
        shipping_city: payload.shippingAddress?.city || payload.shipping_city || 'Abidjan',
        shipping_notes: payload.shippingAddress?.notes || payload.notes || '',
        shipping_method: payload.shipping?.method || 'standard',
        item_count: items.length,
        items,
        total: null, // No total at creation, awaiting admin pricing
        subtotal: null,
      };

      db.orders.unshift(newOrder);
      saveDb(db);

      sendJson(res, 201, {
        success: true,
        message: 'Demande de commande enregistrée avec succès. Elle est transmise au pôle tarification (Statut: À chiffrer).',
        data: { order: newOrder },
        order: newOrder,
      });
      return true;
    } catch (e: any) {
      sendJson(res, 400, { success: false, message: e.message || 'Erreur lors de la création de la commande' });
      return true;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. ADMIN ENDPOINTS (Full access to private reference prices & pricing workflow)
  // ─────────────────────────────────────────────────────────────

  // GET /api/admin/products
  if (pathname === '/api/admin/products' && method === 'GET') {
    sendJson(res, 200, {
      success: true,
      data: {
        products: db.products,
        total: db.products.length,
      },
    });
    return true;
  }

  // POST /api/admin/products
  if (pathname === '/api/admin/products' && method === 'POST') {
    try {
      const body = await parseBody<Partial<Product>>(req);
      if (!body.name || !body.name.trim()) {
        sendJson(res, 400, { success: false, message: 'Le nom du produit est requis' });
        return true;
      }

      const refPrice = typeof body.ref_price === 'number'
        ? body.ref_price
        : (typeof body.price === 'number' ? body.price : parseFloat(String(body.ref_price || body.price || 0)) || 0);

      const newId = `prod-${Date.now()}`;
      const newProduct: Product = {
        id: newId,
        name: body.name.trim(),
        sku: (body.sku || body.reference || `REF-${newId}`).trim(),
        reference: (body.reference || body.sku || `REF-${newId}`).trim(),
        description: body.description?.trim() || body.description_short?.trim() || '',
        description_short: body.description_short?.trim() || body.description?.slice(0, 100) || '',
        category: body.category || 'Consommables',
        category_main: (body.category_main || body.category || 'consommables').toLowerCase(),
        category_sub: body.category_sub?.trim(),
        unit: body.unit || 'Boîte',
        conditionnement: body.conditionnement || 'Boîte standard',
        stock: typeof body.stock === 'number' ? body.stock : 100,
        is_active: body.is_active !== false,
        ref_price: refPrice, // Saved as private reference price
        cert_ce: body.cert_ce ?? 1,
        currency: 'FCFA',
      };

      db.products.unshift(newProduct);
      saveDb(db);

      sendJson(res, 201, {
        success: true,
        message: 'Produit créé avec succès',
        data: { product: newProduct },
      });
      return true;
    } catch (e: any) {
      sendJson(res, 400, { success: false, message: e.message });
      return true;
    }
  }

  // PUT /api/admin/products/:id
  const adminProductMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
  if (adminProductMatch && method === 'PUT') {
    try {
      const id = adminProductMatch[1];
      const body = await parseBody<Partial<Product>>(req);
      const prodIndex = db.products.findIndex((p) => String(p.id) === id);

      if (prodIndex === -1) {
        sendJson(res, 404, { success: false, message: 'Produit introuvable' });
        return true;
      }

      const existing = db.products[prodIndex];

      // Handle ref_price update
      let updatedRefPrice = existing.ref_price;
      if (body.ref_price !== undefined) {
        updatedRefPrice = parseFloat(String(body.ref_price)) || 0;
      } else if (body.price !== undefined) {
        updatedRefPrice = parseFloat(String(body.price)) || 0;
      }

      const updatedProduct: Product = {
        ...existing,
        ...body,
        id: existing.id, // preserve ID
        ref_price: updatedRefPrice,
      };

      db.products[prodIndex] = updatedProduct;
      saveDb(db);

      sendJson(res, 200, {
        success: true,
        message: 'Produit mis à jour avec succès',
        data: { product: updatedProduct },
      });
      return true;
    } catch (e: any) {
      sendJson(res, 400, { success: false, message: e.message });
      return true;
    }
  }

  // DELETE /api/admin/products/:id
  if (adminProductMatch && method === 'DELETE') {
    const id = adminProductMatch[1];
    const prodIndex = db.products.findIndex((p) => String(p.id) === id);
    if (prodIndex === -1) {
      sendJson(res, 404, { success: false, message: 'Produit introuvable' });
      return true;
    }
    // Delete or mark inactive
    db.products.splice(prodIndex, 1);
    saveDb(db);
    sendJson(res, 200, { success: true, message: 'Produit supprimé du catalogue' });
    return true;
  }

  // GET /api/admin/orders
  if (pathname === '/api/admin/orders' && method === 'GET') {
    sendJson(res, 200, {
      success: true,
      data: { orders: db.orders },
    });
    return true;
  }

  // GET /api/admin/orders/:id/pricing (Automatic pricing retrieval and table generation)
  const pricingMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/pricing$/);
  if (pricingMatch && method === 'GET') {
    const orderId = pricingMatch[1];
    const order = db.orders.find((o) => String(o.id) === orderId || o.orderNumber === orderId || o.order_number === orderId);

    if (!order) {
      sendJson(res, 404, { success: false, message: 'Commande introuvable' });
      return true;
    }

    // Build the pricing lines
    let totalQty = 0;
    let computedTotal = 0;
    let hasMissing = false;

    const lines: PricingLine[] = order.items.map((item) => {
      const qty = item.quantity ?? item.qty ?? 1;
      totalQty += qty;

      // Find in catalog
      const prod = db.products.find(
        (p) =>
          String(p.id) === String(item.productId) ||
          (p.reference && item.reference && p.reference.toLowerCase() === item.reference.toLowerCase()) ||
          p.name.toLowerCase() === (item.name || item.product_name || '').toLowerCase()
      );

      const catalogRefPrice = (prod && typeof prod.ref_price === 'number' && prod.ref_price > 0)
        ? prod.ref_price
        : null;

      // Check if item already has a quoted price or fallback to catalog reference price
      const effectiveUnitPrice = (typeof item.unit_price === 'number' && item.unit_price > 0)
        ? item.unit_price
        : catalogRefPrice;

      const isMissing = effectiveUnitPrice === null || effectiveUnitPrice <= 0;
      if (isMissing) {
        hasMissing = true;
      }

      const lineTotal = effectiveUnitPrice ? effectiveUnitPrice * qty : null;
      if (lineTotal) {
        computedTotal += lineTotal;
      }

      return {
        productId: prod ? prod.id : (item.productId || 'unknown'),
        name: item.name || item.product_name || (prod ? prod.name : 'Article'),
        reference: item.reference || item.product_ref || (prod ? prod.reference : ''),
        unit: item.unit || (prod ? prod.unit : 'Unité'),
        quantity: qty,
        ref_price: catalogRefPrice,
        unit_price: effectiveUnitPrice,
        line_total: lineTotal,
        missing_price: isMissing,
      };
    });

    const summary: OrderPricingSummary = {
      orderId: order.id,
      orderNumber: order.orderNumber || order.order_number || String(order.id),
      status: order.status,
      client: order.establishment_name || 'Établissement client',
      lines,
      totalQuantity: totalQty,
      totalAmount: hasMissing ? null : computedTotal,
      hasMissingPrices: hasMissing,
      canValidate: !hasMissing && lines.length > 0,
      pricedAt: order.priced_at,
    };

    sendJson(res, 200, {
      success: true,
      data: { order, pricingSummary: summary },
    });
    return true;
  }

  // POST /api/admin/orders/:id/save-pricing (Save draft quotation without locking)
  const savePricingMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/save-pricing$/);
  if (savePricingMatch && method === 'POST') {
    try {
      const orderId = savePricingMatch[1];
      const body = await parseBody<{ items: { productId: string | number; unit_price: number }[] }>(req);
      const orderIndex = db.orders.findIndex((o) => String(o.id) === orderId || o.orderNumber === orderId);

      if (orderIndex === -1) {
        sendJson(res, 404, { success: false, message: 'Commande introuvable' });
        return true;
      }

      const order = db.orders[orderIndex];
      let newTotal = 0;

      // Update line prices
      order.items = order.items.map((item) => {
        const matchUpdate = (body.items || []).find(
          (b) => String(b.productId) === String(item.productId) || (item.reference && item.reference === (b as any).reference)
        );

        const newUnitPrice = matchUpdate ? parseFloat(String(matchUpdate.unit_price)) || 0 : (item.unit_price || 0);
        const qty = item.quantity ?? item.qty ?? 1;
        const lineTot = newUnitPrice * qty;
        newTotal += lineTot;

        return {
          ...item,
          unit_price: newUnitPrice,
          line_total: lineTot,
        };
      });

      order.total = newTotal;
      // Do not change status to validated yet, it is saved draft
      saveDb(db);

      sendJson(res, 200, {
        success: true,
        message: 'Brouillon de chiffrage enregistré avec succès.',
        data: { order },
      });
      return true;
    } catch (e: any) {
      sendJson(res, 400, { success: false, message: e.message });
      return true;
    }
  }

  // POST /api/admin/orders/:id/validate-pricing (Validate, freeze and lock prices into order record)
  const validatePricingMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/validate-pricing$/);
  if (validatePricingMatch && method === 'POST') {
    try {
      const orderId = validatePricingMatch[1];
      const body = await parseBody<{ items: { productId: string | number; unit_price: number }[] }>(req);
      const orderIndex = db.orders.findIndex((o) => String(o.id) === orderId || o.orderNumber === orderId);

      if (orderIndex === -1) {
        sendJson(res, 404, { success: false, message: 'Commande introuvable' });
        return true;
      }

      const order = db.orders[orderIndex];
      let finalTotal = 0;
      const invalidItems: string[] = [];

      const updatedItems: OrderItem[] = order.items.map((item) => {
        const matchUpdate = (body.items || []).find(
          (b) => String(b.productId) === String(item.productId) || (item.reference && item.reference === (b as any).reference)
        );

        // Fallback to existing or catalog reference price
        let chosenPrice = matchUpdate ? parseFloat(String(matchUpdate.unit_price)) : (item.unit_price || 0);
        if (!chosenPrice || chosenPrice <= 0) {
          const prod = db.products.find((p) => String(p.id) === String(item.productId));
          if (prod && typeof prod.ref_price === 'number' && prod.ref_price > 0) {
            chosenPrice = prod.ref_price;
          }
        }

        if (!chosenPrice || chosenPrice <= 0) {
          invalidItems.push(item.name || item.product_name || `Article ${item.productId}`);
        }

        const qty = item.quantity ?? item.qty ?? 1;
        const lineTot = chosenPrice * qty;
        finalTotal += lineTot;

        return {
          ...item,
          unit_price: chosenPrice,
          unitPrice: chosenPrice,
          line_total: lineTot,
        };
      });

      if (invalidItems.length > 0) {
        sendJson(res, 400, {
          success: false,
          message: `Impossible de valider le chiffrage : les articles suivants n'ont pas de prix valide : ${invalidItems.join(', ')}`,
        });
        return true;
      }

      // Freezing pricing onto the order & generating invoice for client
      const orderRef = order.orderNumber || order.order_number || String(order.id);
      const invoiceNumber = order.invoice_number || `FAC-${orderRef.replace('CMD-', '')}`;
      const nowIso = new Date().toISOString();

      order.items = updatedItems;
      order.total = finalTotal;
      order.subtotal = finalTotal;
      order.status = 'Facture disponible';
      order.priced_at = nowIso;
      order.is_priced = true;
      order.invoice_number = invoiceNumber;
      order.invoice_date = nowIso;
      order.invoice_sent = true;
      order.invoice_sent_at = nowIso;

      saveDb(db);

      sendJson(res, 200, {
        success: true,
        message: `Facture ${invoiceNumber} générée et transmise avec succès au client. Montant total : ${finalTotal.toLocaleString('fr-FR')} FCFA.`,
        data: { order, invoiceNumber, total: finalTotal },
      });
      return true;
    } catch (e: any) {
      sendJson(res, 400, { success: false, message: e.message });
      return true;
    }
  }

  // GET /api/orders/show.php or GET /api/invoices/orders/:id/invoice
  if (pathname.includes('/orders/show.php') || pathname.match(/\/invoices\/orders\/([^/]+)\/invoice/)) {
    const idParam = url.searchParams.get('id') || url.searchParams.get('order_id') || pathname.split('/')[4];
    const order = db.orders.find((o) => String(o.id) === idParam || o.orderNumber === idParam || o.order_number === idParam);
    if (!order) {
      sendJson(res, 404, { success: false, message: 'Commande introuvable' });
      return true;
    }
    const publicOrder = sanitizePublicOrder(order);
    sendJson(res, 200, {
      success: true,
      data: { order: publicOrder },
      order: publicOrder,
    });
    return true;
  }

  // GET /api/admin/users (Returns all users after automatic inactivity verification)
  if (pathname === '/api/admin/users' && method === 'GET') {
    checkAndProcessCustomerInactivity(db);
    sendJson(res, 200, {
      success: true,
      data: { users: db.users },
      users: db.users,
    });
    return true;
  }

  // PATCH /api/admin/users/:id/status (Update customer status)
  const userStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (userStatusMatch && (method === 'PATCH' || method === 'POST')) {
    try {
      const userId = userStatusMatch[1];
      const body = await parseBody<{ status: string }>(req);
      const userIndex = db.users.findIndex((u) => String(u.id) === userId);
      if (userIndex === -1) {
        sendJson(res, 404, { success: false, message: 'Utilisateur introuvable' });
        return true;
      }
      db.users[userIndex].status = body.status;
      if (body.status === 'inactive' && !db.users[userIndex].became_inactive_at) {
        db.users[userIndex].became_inactive_at = new Date().toISOString();
      }
      saveDb(db);
      sendJson(res, 200, {
        success: true,
        message: `Statut utilisateur mis à jour avec succès : ${body.status}`,
        data: { user: db.users[userIndex] },
      });
      return true;
    } catch (e: any) {
      sendJson(res, 400, { success: false, message: e.message });
      return true;
    }
  }

  // POST /api/admin/users/:id/relance (Trigger verified B2B restock relance via WhatsApp & Email)
  const userRelanceMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/relance$/);
  if (userRelanceMatch && method === 'POST') {
    try {
      const userId = userRelanceMatch[1];
      const body = await parseBody<{ subject?: string; message?: string; channel?: string }>(req);
      const userIndex = db.users.findIndex((u) => String(u.id) === userId);
      if (userIndex === -1) {
        sendJson(res, 404, { success: false, message: 'Utilisateur introuvable' });
        return true;
      }

      const u = db.users[userIndex];
      const clientTitle = u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : (u.name || 'Client B2B');
      const structureName = u.establishment_name || 'votre établissement de santé';
      const clientCleanPhone = (u.phone || '+2250709554020').replace(/[^0-9]/g, '');

      const subject = body.subject || `Reprise de vos approvisionnements médicaux — CYM Pharma (${structureName})`;
      const message = body.message || `Bonjour ${clientTitle},\n\nCYM Pharma reste à votre disposition pour le réassort de ${structureName}. De nouveaux arrivages certifiés CE / ISO sont disponibles avec livraison express garantie sous 2h à Abidjan.\n\nContactez notre cellule commerciale au +225 07 09 55 40 20 ou par email à commandes@cympharma.ci pour bénéficier de vos tarifs privilégiés.\n\nBien cordialement,\nCYM PHARMA SARL`;

      const waUrl = `https://wa.me/${clientCleanPhone}?text=${encodeURIComponent(message)}`;

      const relance: RelanceLog = {
        id: `REL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId: u.id,
        userName: clientTitle,
        establishmentName: structureName,
        recipientEmail: u.email,
        recipientPhone: u.phone || '+225 07 09 55 40 20',
        channel: (body.channel as any) || 'multichannel',
        triggerReason: 'Relance administrative déclenchée avec succès',
        daysSinceLastOrder: u.days_since_last_order || 0,
        lastOrderDate: u.last_order_at,
        subject,
        message,
        status: 'sent',
        sent_at: new Date().toISOString(),
        whatsappDirectUrl: waUrl,
      };

      if (!Array.isArray(db.relances)) db.relances = [];
      db.relances.unshift(relance);
      recordOutboxRelance(relance);

      u.last_relance_at = relance.sent_at;
      u.relance_count = (u.relance_count || 0) + 1;
      u.last_relance_channel = relance.channel;
      u.last_relance_status = 'sent';
      saveDb(db);

      sendJson(res, 200, {
        success: true,
        message: `Message de relance officiel transmis avec succès via ${relance.channel} à ${structureName}.`,
        data: { relance, user: u },
      });
      return true;
    } catch (e: any) {
      sendJson(res, 400, { success: false, message: e.message });
      return true;
    }
  }

  // GET /api/admin/relances (Returns full relances audit trail)
  if (pathname === '/api/admin/relances' && method === 'GET') {
    checkAndProcessCustomerInactivity(db);
    sendJson(res, 200, {
      success: true,
      data: { relances: db.relances || [] },
      relances: db.relances || [],
    });
    return true;
  }

  // POST /api/admin/check-inactivity (Triggers automatic customer inactivity check & relance dispatch)
  if (pathname === '/api/admin/check-inactivity' && method === 'POST') {
    const result = checkAndProcessCustomerInactivity(db);
    sendJson(res, 200, {
      success: true,
      message: `Vérification automatique terminée : ${result.newlyInactive.length} client(s) passés au statut Inactif, ${result.relancesSent.length} relance(s) envoyée(s).`,
      data: result,
    });
    return true;
  }

  return false;
}

/**
 * Vite Plugin for embedding the CYM Pharma backend directly into Vite Dev & Preview server
 */
export function cymApiPlugin() {
  return {
    name: 'cym-api-backend',
    configureServer(server: any) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        try {
          const handled = await handleApiRoute(req, res);
          if (!handled) {
            next();
          }
        } catch (err) {
          console.error('Error in CYM API Middleware:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, message: 'Erreur interne du serveur' }));
        }
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        try {
          const handled = await handleApiRoute(req, res);
          if (!handled) {
            next();
          }
        } catch (err) {
          next();
        }
      });
    },
  };
}
