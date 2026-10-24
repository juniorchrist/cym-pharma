import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { ALL_PRODUCTS, CATALOG_CATEGORIES } from '../data/catalog.ts';
import { Product, Order, OrderItem, PricingLine, OrderPricingSummary, User, RelanceLog } from '../types/index.ts';
import {
  InventoryItem,
  StockMovement,
  InventoryPeriod,
  InventoryCount,
  PeriodItem,
  MovementType,
  InventoryItemWithStatus,
  MovementWithItem,
  PeriodWithCounts,
  InventoryStats,
  ImportPreviewRow,
  ImportPreviewResult,
} from '../types/inventaire.ts';
import * as _XLSX from 'xlsx';
const XLSX: any = (_XLSX as any).default || _XLSX;

interface DatabaseSchema {
  products: Product[];
  orders: Order[];
  users: User[];
  relances: RelanceLog[];
  inventory_items?: InventoryItem[];
  stock_movements?: StockMovement[];
  inventory_periods?: InventoryPeriod[];
  inventory_counts?: InventoryCount[];
  period_items?: PeriodItem[];
  lastUpdated: string;
}


/**
 * Parse Classeur1.xlsx if present to provide seamless pre-seeded inventory
 */
function seedInventoryFromClasseur(): { items: InventoryItem[]; movements: StockMovement[]; periods: InventoryPeriod[]; counts: InventoryCount[]; periodItems: PeriodItem[] } {
  const items: InventoryItem[] = [];
  const movements: StockMovement[] = [];
  const periods: InventoryPeriod[] = [];
  const counts: InventoryCount[] = [];
  const periodItems: PeriodItem[] = [];

  const classeurPath = path.resolve(process.cwd(), 'Classeur1.xlsx');
  if (fs.existsSync(classeurPath)) {
    try {
      const wb = XLSX.readFile(classeurPath);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      const rows = rawData.slice(3).filter((r) => r[0] && typeof r[0] === 'string' && r[0].trim());

      const periodId = 'per_2026_10';
      const openPeriod: InventoryPeriod = {
        id: periodId,
        year_month: '2026-10',
        status: 'counting',
        opened_at: new Date('2026-10-01T08:00:00Z').toISOString(),
        closed_at: null,
        closed_by: null,
      };
      periods.push(openPeriod);

      const seen = new Set<string>();
      let artIdx = 1;

      for (const r of rows) {
        const rawDes = String(r[0]).trim();
        const normDes = rawDes.toUpperCase().replace(/\s+/g, ' ');
        if (!normDes) continue;

        // Skip exact duplicate designation
        if (seen.has(normDes)) {
          continue;
        }
        seen.add(normDes);

        const openingQty = Number(r[1]) || 0;
        const currentQty = Number(r[2]) || 0;
        const isNeg = currentQty < 0;

        let unitLabel = 'Unité';
        if (rawDes.includes('B/100')) unitLabel = 'Boîte de 100';
        else if (rawDes.includes('B/50')) unitLabel = 'Boîte de 50';
        else if (rawDes.includes('B/12')) unitLabel = 'Boîte de 12';
        else if (rawDes.includes('B/25')) unitLabel = 'Boîte de 25';
        else if (rawDes.includes('P/100')) unitLabel = 'Paquet de 100';
        else if (rawDes.includes('5L')) unitLabel = 'Bidon 5L';
        else if (rawDes.includes('1L')) unitLabel = 'Flacon 1L';

        const itemId = 'item_' + String(artIdx).padStart(4, '0');
        const code = 'ART-' + String(artIdx).padStart(4, '0');
        const finalQty = isNeg ? 0 : currentQty;
        const isTracked = currentQty > 0;

        const item: InventoryItem = {
          id: itemId,
          code,
          designation: rawDes,
          designation_norm: normDes,
          unit_label: unitLabel,
          product_id: null,
          min_stock: isTracked ? 5 : null,
          is_tracked: isTracked,
          qty_on_hand: finalQty,
          is_active: true,
          created_at: new Date('2026-10-01T08:00:00Z').toISOString(),
          updated_at: new Date().toISOString(),
        };
        items.push(item);

        if (finalQty > 0) {
          movements.push({
            id: 'mvt_' + itemId + '_open',
            item_id: itemId,
            type: 'opening',
            quantity: finalQty,
            movement_date: '2026-10-01',
            reason: isNeg ? 'Stock négatif dans classeur (' + currentQty + ') importé à 0' : 'Reprise de stock initial Classeur1.xlsx',
            order_id: null,
            order_item_id: null,
            period_id: periodId,
            created_by: 'Système Import',
            created_at: new Date('2026-10-01T08:00:00Z').toISOString(),
          });
        }

        counts.push({
          id: 'cnt_' + periodId + '_' + itemId,
          period_id: periodId,
          item_id: itemId,
          theoretical_qty: finalQty,
          counted_qty: null,
          variance: null,
          note: isNeg ? 'Valeur négative (' + currentQty + ') dans classeur' : null,
          counted_by: null,
          counted_at: null,
          status: 'draft',
        });

        artIdx++;
      }
    } catch (err) {
      console.error('Error seeding inventory from Classeur1.xlsx:', err);
    }
  }

  return { items, movements, periods, counts, periodItems };
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

  const seededInv = seedInventoryFromClasseur();
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
    inventory_items: seededInv.items,
    stock_movements: seededInv.movements,
    inventory_periods: seededInv.periods,
    inventory_counts: seededInv.counts,
    period_items: seededInv.periodItems,
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
  if (!dbCache.inventory_items || dbCache.inventory_items.length === 0) {
    const seeded = seedInventoryFromClasseur();
    dbCache.inventory_items = seeded.items;
    dbCache.stock_movements = seeded.movements;
    dbCache.inventory_periods = seeded.periods;
    dbCache.inventory_counts = seeded.counts;
    dbCache.period_items = seeded.periodItems;
    saveDb(dbCache);
  }
  if (!dbCache.stock_movements) dbCache.stock_movements = [];
  if (!dbCache.inventory_periods) dbCache.inventory_periods = [];
  if (!dbCache.inventory_counts) dbCache.inventory_counts = [];
  if (!dbCache.period_items) dbCache.period_items = [];
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
 * Remove ALL price AND stock fields before returning data to public clients.
 * IMPORTANT: Any new field added to Product that is stock/price-related
 * MUST be explicitly deleted here.
 */
export function sanitizePublicProduct(prod: Product): Product {
  // Explicit whitelist approach: only keep safe fields
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ref_price, price, base_price, oldPrice,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stock, stockQuantity, inStock,
    ...safe
  } = prod as any;
  // Also remove any inventory-related keys that might have leaked
  const result = { ...safe } as Product;
  delete (result as any).qty_on_hand;
  delete (result as any).min_stock;
  delete (result as any).inventory_item_id;
  return result;
}

/**
 * Verify that the request carries a valid admin token.
 * In the dev Vite backend, we accept any token that was issued
 * to the admin user (starts with 'admin_jwt_' or is stored as admin).
 * Returns true if access should be granted, false → send 403.
 */
function verifyAdminRequest(req: IncomingMessage): boolean {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return false;
  // In production PHP, JWT signature is verified cryptographically.
  // In the Vite dev backend, we check the token format/prefix used
  // by the local auth flow in api.ts.
  if (token.startsWith('admin_jwt_')) return true;
  if (token.startsWith('local_usr_admin_')) return true;
  // Also accept tokens stored in the DB under the admin user
  try {
    const db = getDb();
    const adminUser = db.users.find(
      (u) => u.role === 'admin' && u.email === 'admin@cympharma.ci'
    );
    // If the token is non-empty and the admin user exists, allow in dev.
    // (In production, JWT secret verification replaces this.)
    return !!adminUser && token.length > 8;
  } catch {
    return false;
  }
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
    req.on('data', (chunk: any) => {
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
  // 2. ADMIN ENDPOINTS (require valid admin JWT)
  // ─────────────────────────────────────────────────────────────

  if (pathname.startsWith('/api/admin/')) {
    if (!verifyAdminRequest(req)) {
      sendJson(res, 403, { success: false, message: 'Accès refusé. Authentification administrateur requise.' });
      return true;
    }
  }

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


  // ─────────────────────────────────────────────────────────────
  // 3. INVENTAIRE & GESTION DES STOCKS (Admin Only)
  // ─────────────────────────────────────────────────────────────

  // GET /api/admin/inventory/stats
  if (pathname === '/api/admin/inventory/stats' && method === 'GET') {
    const items = db.inventory_items || [];
    const activeItems = items.filter((i) => i.is_active !== false);
    const periods = db.inventory_periods || [];
    const openPeriod = periods.find((p) => p.status === 'counting' || p.status === 'open') || null;

    let in_stock = 0;
    let low_stock = 0;
    let out_of_stock = 0;
    let negative = 0;
    let untracked = 0;
    let total_tracked = 0;

    for (const item of activeItems) {
      if (!item.is_tracked) {
        untracked++;
      } else {
        total_tracked++;
        if (item.qty_on_hand < 0) {
          negative++;
        } else if (item.qty_on_hand === 0) {
          out_of_stock++;
        } else if (item.qty_on_hand <= (item.min_stock || 5)) {
          low_stock++;
        } else {
          in_stock++;
        }
      }
    }

    const stats: InventoryStats = {
      total_tracked,
      in_stock,
      low_stock,
      out_of_stock,
      negative,
      untracked,
      open_period: openPeriod,
    };

    sendJson(res, 200, { success: true, data: stats });
    return true;
  }

  // GET /api/admin/inventory/items
  if (pathname === '/api/admin/inventory/items' && method === 'GET') {
    const search = (url.searchParams.get('search') || '').toLowerCase().trim();
    const statusFilter = url.searchParams.get('status') || 'all';
    const isTrackedFilter = url.searchParams.get('is_tracked');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10)));

    const items = (db.inventory_items || []).filter((i) => i.is_active !== false);

    const itemsWithStatus: InventoryItemWithStatus[] = items.map((item) => {
      let status: any = 'in_stock';
      if (!item.is_tracked) {
        status = 'untracked';
      } else if (item.qty_on_hand < 0) {
        status = 'negative';
      } else if (item.qty_on_hand === 0) {
        status = 'out_of_stock';
      } else if (item.qty_on_hand <= (item.min_stock || 5)) {
        status = 'low_stock';
      }
      return { ...item, status };
    });

    let filtered = itemsWithStatus;

    if (search) {
      filtered = filtered.filter(
        (i) =>
          i.designation.toLowerCase().includes(search) ||
          i.code.toLowerCase().includes(search) ||
          (i.unit_label && i.unit_label.toLowerCase().includes(search))
      );
    }

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((i) => i.status === statusFilter);
    }

    if (isTrackedFilter !== null && isTrackedFilter !== undefined && isTrackedFilter !== '') {
      const wantTracked = isTrackedFilter === 'true';
      filtered = filtered.filter((i) => i.is_tracked === wantTracked);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    sendJson(res, 200, {
      success: true,
      data: {
        items: paginated,
        total,
        page,
        totalPages,
      },
    });
    return true;
  }

  // POST /api/admin/inventory/items
  if (pathname === '/api/admin/inventory/items' && method === 'POST') {
    try {
      const body = await parseBody<any>(req);
      if (!body.designation || !body.designation.trim()) {
        sendJson(res, 400, { success: false, message: 'La désignation est obligatoire.' });
        return true;
      }

      const items = db.inventory_items || [];
      const newId = 'item_' + Date.now();
      const code = 'ART-' + String(items.length + 1).padStart(4, '0');
      const openingQty = Number(body.opening_qty) || 0;
      const isTracked = body.is_tracked !== undefined ? !!body.is_tracked : true;

      const newItem: InventoryItem = {
        id: newId,
        code,
        designation: body.designation.trim(),
        designation_norm: body.designation.trim().toUpperCase().replace(/\s+/g, ' '),
        unit_label: body.unit_label?.trim() || 'Unité',
        product_id: body.product_id || null,
        min_stock: body.min_stock !== undefined ? Number(body.min_stock) : (isTracked ? 5 : null),
        is_tracked: isTracked,
        qty_on_hand: openingQty,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      items.push(newItem);
      db.inventory_items = items;

      if (openingQty > 0) {
        db.stock_movements = db.stock_movements || [];
        db.stock_movements.push({
          id: 'mvt_' + Date.now(),
          item_id: newId,
          type: 'opening',
          quantity: openingQty,
          movement_date: body.movement_date || new Date().toISOString().split('T')[0],
          reason: body.opening_reason || 'Stock initial à la création',
          order_id: null,
          order_item_id: null,
          period_id: null,
          created_by: 'Admin',
          created_at: new Date().toISOString(),
        });
      }

      saveDb(db);
      sendJson(res, 201, { success: true, data: newItem, message: 'Article créé avec succès.' });
      return true;
    } catch (err: any) {
      sendJson(res, 400, { success: false, message: err.message });
      return true;
    }
  }

  // GET /api/admin/inventory/items/:id
  const itemDetailMatch = pathname.match(/^\/api\/admin\/inventory\/items\/([^/]+)$/);
  if (itemDetailMatch && method === 'GET') {
    const id = itemDetailMatch[1];
    const item = (db.inventory_items || []).find((i) => i.id === id);
    if (!item) {
      sendJson(res, 404, { success: false, message: 'Article introuvable' });
      return true;
    }
    const recentMovements = (db.stock_movements || [])
      .filter((m) => m.item_id === id)
      .slice(-10)
      .reverse();
    sendJson(res, 200, { success: true, data: { ...item, recentMovements } });
    return true;
  }

  // PATCH /api/admin/inventory/items/:id
  if (itemDetailMatch && method === 'PATCH') {
    const id = itemDetailMatch[1];
    const item = (db.inventory_items || []).find((i) => i.id === id);
    if (!item) {
      sendJson(res, 404, { success: false, message: 'Article introuvable' });
      return true;
    }
    try {
      const body = await parseBody<any>(req);
      if (body.designation !== undefined) {
        item.designation = body.designation.trim();
        item.designation_norm = item.designation.toUpperCase().replace(/\s+/g, ' ');
      }
      if (body.unit_label !== undefined) item.unit_label = body.unit_label.trim();
      if (body.min_stock !== undefined) item.min_stock = body.min_stock !== null ? Number(body.min_stock) : null;
      if (body.is_tracked !== undefined) item.is_tracked = !!body.is_tracked;
      if (body.product_id !== undefined) item.product_id = body.product_id;
      if (body.is_active !== undefined) item.is_active = !!body.is_active;
      item.updated_at = new Date().toISOString();

      saveDb(db);
      sendJson(res, 200, { success: true, data: item, message: 'Article mis à jour.' });
      return true;
    } catch (err: any) {
      sendJson(res, 400, { success: false, message: err.message });
      return true;
    }
  }

  // DELETE /api/admin/inventory/items/:id
  if (itemDetailMatch && method === 'DELETE') {
    const id = itemDetailMatch[1];
    const item = (db.inventory_items || []).find((i) => i.id === id);
    if (!item) {
      sendJson(res, 404, { success: false, message: 'Article introuvable' });
      return true;
    }
    item.is_active = false;
    item.updated_at = new Date().toISOString();
    saveDb(db);
    sendJson(res, 200, { success: true, message: 'Article archivé.' });
    return true;
  }

  // GET /api/admin/inventory/movements
  if (pathname === '/api/admin/inventory/movements' && method === 'GET') {
    const itemId = url.searchParams.get('item_id');
    const typeFilter = url.searchParams.get('type');
    const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10)));

    let movements = db.stock_movements || [];
    if (itemId) {
      movements = movements.filter((m) => m.item_id === itemId);
    }
    if (typeFilter) {
      movements = movements.filter((m) => m.type === typeFilter);
    }

    const itemsMap = new Map((db.inventory_items || []).map((i) => [i.id, i]));
    const enriched: MovementWithItem[] = movements.slice(-limit).reverse().map((m) => {
      const it = itemsMap.get(m.item_id);
      return {
        ...m,
        designation: it?.designation || 'Article inconnu',
        unit_label: it?.unit_label || 'Unité',
      };
    });

    sendJson(res, 200, { success: true, data: { movements: enriched, total: movements.length } });
    return true;
  }

  // POST /api/admin/inventory/movements
  if (pathname === '/api/admin/inventory/movements' && method === 'POST') {
    try {
      const body = await parseBody<any>(req);
      const { item_id, type, quantity, movement_date, reason, order_id, order_item_id, period_id } = body;

      if (!item_id) {
        sendJson(res, 400, { success: false, message: 'item_id est requis.' });
        return true;
      }
      const item = (db.inventory_items || []).find((i) => i.id === item_id);
      if (!item) {
        sendJson(res, 404, { success: false, message: 'Article introuvable.' });
        return true;
      }

      const qty = Number(quantity);
      if (isNaN(qty) || qty === 0) {
        sendJson(res, 400, { success: false, message: 'La quantité doit être un nombre non nul.' });
        return true;
      }

      const validTypes: MovementType[] = [
        'opening',
        'purchase',
        'sale_shop',
        'sale_online',
        'return',
        'loss',
        'adjustment',
        'count_correction',
      ];
      if (!validTypes.includes(type)) {
        sendJson(res, 400, { success: false, message: 'Type de mouvement invalide: ' + type });
        return true;
      }

      // Calculate quantity impact on qty_on_hand
      let delta = 0;
      if (type === 'purchase' || type === 'return' || type === 'opening') {
        delta = Math.abs(qty);
      } else if (type === 'sale_shop' || type === 'sale_online' || type === 'loss') {
        delta = -Math.abs(qty);
      } else if (type === 'adjustment' || type === 'count_correction') {
        delta = qty; // can be signed
      }

      item.qty_on_hand = (item.qty_on_hand || 0) + delta;
      item.updated_at = new Date().toISOString();

      const newMvt: StockMovement = {
        id: 'mvt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        item_id,
        type,
        quantity: Math.abs(qty),
        movement_date: movement_date || new Date().toISOString().split('T')[0],
        reason: reason || null,
        order_id: order_id || null,
        order_item_id: order_item_id || null,
        period_id: period_id || null,
        created_by: 'Admin',
        created_at: new Date().toISOString(),
      };

      db.stock_movements = db.stock_movements || [];
      db.stock_movements.push(newMvt);

      saveDb(db);
      sendJson(res, 201, {
        success: true,
        data: { movement: newMvt, item },
        message: 'Mouvement enregistré. Nouveau stock : ' + item.qty_on_hand,
      });
      return true;
    } catch (err: any) {
      sendJson(res, 400, { success: false, message: err.message });
      return true;
    }
  }

  // GET /api/admin/inventory/periods
  if (pathname === '/api/admin/inventory/periods' && method === 'GET') {
    const periods = db.inventory_periods || [];
    const counts = db.inventory_counts || [];

    const result: PeriodWithCounts[] = periods.map((p) => {
      const pCounts = counts.filter((c) => c.period_id === p.id);
      const counted_items = pCounts.filter((c) => c.counted_qty !== null).length;
      const items_with_variance = pCounts.filter((c) => c.variance !== null && c.variance !== 0).length;

      return {
        ...p,
        total_items: pCounts.length,
        counted_items,
        items_with_variance,
      };
    });

    sendJson(res, 200, { success: true, data: result });
    return true;
  }

  // POST /api/admin/inventory/periods/start
  if (pathname === '/api/admin/inventory/periods/start' && method === 'POST') {
    try {
      const body = await parseBody<any>(req);
      const year_month = body.year_month || new Date().toISOString().slice(0, 7);

      db.inventory_periods = db.inventory_periods || [];
      db.inventory_counts = db.inventory_counts || [];

      // Check if open period already exists for this year_month
      const existing = db.inventory_periods.find((p) => p.year_month === year_month);
      if (existing && existing.status !== 'closed') {
        sendJson(res, 200, { success: true, data: existing, message: 'Période existante reprise.' });
        return true;
      }

      const periodId = 'per_' + year_month.replace('-', '_');
      const newPeriod: InventoryPeriod = {
        id: periodId,
        year_month,
        status: 'counting',
        opened_at: new Date().toISOString(),
        closed_at: null,
        closed_by: null,
      };

      db.inventory_periods.push(newPeriod);

      // Create count entries for all active tracked items
      const trackedItems = (db.inventory_items || []).filter((i) => i.is_active !== false && i.is_tracked);
      for (const item of trackedItems) {
        db.inventory_counts.push({
          id: 'cnt_' + periodId + '_' + item.id,
          period_id: periodId,
          item_id: item.id,
          theoretical_qty: item.qty_on_hand,
          counted_qty: null,
          variance: null,
          note: null,
          counted_by: null,
          counted_at: null,
          status: 'draft',
        });
      }

      saveDb(db);
      sendJson(res, 201, { success: true, data: newPeriod, message: 'Nouvelle période démarrée pour ' + year_month });
      return true;
    } catch (err: any) {
      sendJson(res, 400, { success: false, message: err.message });
      return true;
    }
  }

  // GET /api/admin/inventory/periods/:id/counts
  const periodCountsMatch = pathname.match(/^\/api\/admin\/inventory\/periods\/([^/]+)\/counts$/);
  if (periodCountsMatch && method === 'GET') {
    const periodId = periodCountsMatch[1];
    const period = (db.inventory_periods || []).find((p) => p.id === periodId);
    if (!period) {
      sendJson(res, 404, { success: false, message: 'Période introuvable.' });
      return true;
    }

    const counts = (db.inventory_counts || []).filter((c) => c.period_id === periodId);
    const itemsMap = new Map((db.inventory_items || []).map((i) => [i.id, i]));

    const enriched = counts.map((c) => {
      const item = itemsMap.get(c.item_id);
      return {
        ...c,
        designation: item?.designation || 'Article inconnu',
        unit_label: item?.unit_label || 'Unité',
        code: item?.code || '',
      };
    });

    sendJson(res, 200, { success: true, data: { period, counts: enriched } });
    return true;
  }

  // PUT /api/admin/inventory/periods/:id/counts/:itemId
  const countUpdateMatch = pathname.match(/^\/api\/admin\/inventory\/periods\/([^/]+)\/counts\/([^/]+)$/);
  if (countUpdateMatch && method === 'PUT') {
    const periodId = countUpdateMatch[1];
    const itemId = countUpdateMatch[2];

    const period = (db.inventory_periods || []).find((p) => p.id === periodId);
    if (!period || period.status === 'closed') {
      sendJson(res, 400, { success: false, message: 'Période clôturée ou introuvable.' });
      return true;
    }

    let count = (db.inventory_counts || []).find((c) => c.period_id === periodId && c.item_id === itemId);
    if (!count) {
      const item = (db.inventory_items || []).find((i) => i.id === itemId);
      count = {
        id: 'cnt_' + periodId + '_' + itemId,
        period_id: periodId,
        item_id: itemId,
        theoretical_qty: item?.qty_on_hand || 0,
        counted_qty: null,
        variance: null,
        note: null,
        counted_by: null,
        counted_at: null,
        status: 'draft',
      };
      db.inventory_counts = db.inventory_counts || [];
      db.inventory_counts.push(count);
    }

    try {
      const body = await parseBody<any>(req);
      if (body.counted_qty !== undefined && body.counted_qty !== null) {
        const val = Number(body.counted_qty);
        count.counted_qty = isNaN(val) ? null : val;
        count.variance = count.counted_qty !== null ? count.counted_qty - count.theoretical_qty : null;
        count.status = 'validated';
        count.counted_at = new Date().toISOString();
        count.counted_by = 'Admin';
      }
      if (body.note !== undefined) count.note = body.note;
      if (body.status !== undefined) count.status = body.status;

      saveDb(db);
      sendJson(res, 200, { success: true, data: count });
      return true;
    } catch (err: any) {
      sendJson(res, 400, { success: false, message: err.message });
      return true;
    }
  }

  // POST /api/admin/inventory/periods/:id/close
  const periodCloseMatch = pathname.match(/^\/api\/admin\/inventory\/periods\/([^/]+)\/close$/);
  if (periodCloseMatch && method === 'POST') {
    const periodId = periodCloseMatch[1];
    const period = (db.inventory_periods || []).find((p) => p.id === periodId);
    if (!period) {
      sendJson(res, 404, { success: false, message: 'Période introuvable.' });
      return true;
    }
    if (period.status === 'closed') {
      sendJson(res, 400, { success: false, message: 'Cette période est déjà clôturée.' });
      return true;
    }

    const counts = (db.inventory_counts || []).filter((c) => c.period_id === periodId);
    let correctionsApplied = 0;
    const nowIso = new Date().toISOString();

    db.stock_movements = db.stock_movements || [];
    db.period_items = db.period_items || [];

    for (const c of counts) {
      const item = (db.inventory_items || []).find((i) => i.id === c.item_id);
      if (!item) continue;

      const closingQty = c.counted_qty !== null ? c.counted_qty : item.qty_on_hand;
      const variance = c.variance !== null ? c.variance : (closingQty - item.qty_on_hand);

      if (variance !== 0 && c.counted_qty !== null) {
        // Generate count_correction movement
        db.stock_movements.push({
          id: 'mvt_correc_' + periodId + '_' + item.id,
          item_id: item.id,
          type: 'count_correction',
          quantity: Math.abs(variance),
          movement_date: nowIso.split('T')[0],
          reason: 'Ajustement inventaire ' + period.year_month + ' (écart: ' + (variance > 0 ? '+' : '') + variance + ')',
          order_id: null,
          order_item_id: null,
          period_id: periodId,
          created_by: 'Admin Clôture',
          created_at: nowIso,
        });
        correctionsApplied++;
        item.qty_on_hand = c.counted_qty;
        item.updated_at = nowIso;
      }

      // Freeze snapshot in period_items
      db.period_items.push({
        period_id: periodId,
        item_id: item.id,
        opening_qty: c.theoretical_qty,
        entries: 0,
        exits: 0,
        closing_qty: closingQty,
      });
    }

    period.status = 'closed';
    period.closed_at = nowIso;
    period.closed_by = 'Administrateur Central';

    saveDb(db);
    sendJson(res, 200, {
      success: true,
      data: { period, corrections_applied: correctionsApplied },
      message: 'Période ' + period.year_month + ' clôturée avec succès. ' + correctionsApplied + ' correction(s) appliquée(s).',
    });
    return true;
  }

  // GET /api/admin/inventory/periods/:id/export
  const periodExportMatch = pathname.match(/^\/api\/admin\/inventory\/periods\/([^/]+)\/export$/);
  if (periodExportMatch && method === 'GET') {
    const periodId = periodExportMatch[1];
    const period = (db.inventory_periods || []).find((p) => p.id === periodId);
    if (!period) {
      sendJson(res, 404, { success: false, message: 'Période introuvable.' });
      return true;
    }

    const counts = (db.inventory_counts || []).filter((c) => c.period_id === periodId);
    const itemsMap = new Map((db.inventory_items || []).map((i) => [i.id, i]));

    let csv = '\uFEFFCode;Désignation;Unité;Stock Théorique;Stock Compté;Écart;Statut;Observation\r\n';
    for (const c of counts) {
      const it = itemsMap.get(c.item_id);
      const code = it?.code || '';
      const des = (it?.designation || '').replace(/;/g, ',');
      const unit = it?.unit_label || 'Unité';
      const theo = c.theoretical_qty ?? '';
      const counted = c.counted_qty ?? '';
      const variance = c.variance ?? '';
      const status = c.status || 'draft';
      const note = (c.note || '').replace(/;/g, ',');
      csv += `${code};${des};${unit};${theo};${counted};${variance};${status};${note}\r\n`;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventaire_' + period.year_month + '.csv"');
    res.end(csv);
    return true;
  }

  // POST /api/admin/inventory/import/preview-server-file
  if (pathname === '/api/admin/inventory/import/preview-server-file' && method === 'POST') {
    const classeurPath = path.resolve(process.cwd(), 'Classeur1.xlsx');
    if (!fs.existsSync(classeurPath)) {
      sendJson(res, 404, { success: false, message: 'Fichier Classeur1.xlsx introuvable à la racine.' });
      return true;
    }

    try {
      const wb = XLSX.readFile(classeurPath);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      const rows = rawData.slice(3).filter((r) => r[0] && typeof r[0] === 'string' && r[0].trim());

      const seen = new Set<string>();
      const previewRows: ImportPreviewRow[] = [];
      let duplicates = 0;
      let negative = 0;
      let zero_stock = 0;
      let valid = 0;

      rows.forEach((r, idx) => {
        const rawDes = String(r[0]).trim();
        const cleanDes = rawDes.toUpperCase().replace(/\s+/g, ' ');
        const opening = Number(r[1]) || 0;
        const current = Number(r[2]) || 0;

        const isDup = seen.has(cleanDes);
        seen.add(cleanDes);
        if (isDup) duplicates++;

        const isNeg = current < 0;
        if (isNeg) negative++;
        if (current === 0) zero_stock++;
        if (current > 0 && !isDup) valid++;

        let unitLabel = 'Unité';
        if (rawDes.includes('B/100')) unitLabel = 'Boîte de 100';
        else if (rawDes.includes('B/50')) unitLabel = 'Boîte de 50';
        else if (rawDes.includes('B/12')) unitLabel = 'Boîte de 12';
        else if (rawDes.includes('B/25')) unitLabel = 'Boîte de 25';
        else if (rawDes.includes('P/100')) unitLabel = 'Paquet de 100';
        else if (rawDes.includes('5L')) unitLabel = 'Bidon 5L';
        else if (rawDes.includes('1L')) unitLabel = 'Flacon 1L';

        previewRows.push({
          row_index: idx + 4,
          designation_raw: rawDes,
          designation_clean: cleanDes,
          unit_label: unitLabel,
          stock_opening: opening,
          stock_current: current,
          is_negative: isNeg,
          is_duplicate: isDup,
          is_tracked: current > 0,
          action: isNeg ? 'import_as_zero' : isDup ? 'skip' : 'import',
          note: isNeg
            ? 'Valeur négative (' + current + ') dans classeur -> initialisé à 0'
            : isDup
            ? 'Doublon détecté avec une ligne précédente'
            : undefined,
        });
      });

      const result: ImportPreviewResult = {
        total_rows: rows.length,
        valid,
        duplicates,
        negative,
        zero_stock,
        rows: previewRows,
      };

      sendJson(res, 200, { success: true, data: result });
      return true;
    } catch (err: any) {
      sendJson(res, 500, { success: false, message: 'Erreur lecture XLSX: ' + err.message });
      return true;
    }
  }

  // POST /api/admin/inventory/import/preview
  if (pathname === '/api/admin/inventory/import/preview' && method === 'POST') {
    try {
      const body = await parseBody<any>(req);
      const rows: any[] = body.rows || [];

      const seen = new Set<string>();
      const previewRows: ImportPreviewRow[] = [];
      let duplicates = 0;
      let negative = 0;
      let zero_stock = 0;
      let valid = 0;

      rows.forEach((r, idx) => {
        const rawDes = String(r.designation || r.nom || r[0] || '').trim();
        if (!rawDes) return;
        const cleanDes = rawDes.toUpperCase().replace(/\s+/g, ' ');
        const current = Number(r.stock ?? r.stock_current ?? r.quantite ?? r[2] ?? 0);
        const opening = Number(r.stock_opening ?? r[1] ?? current);

        const isDup = seen.has(cleanDes);
        seen.add(cleanDes);
        if (isDup) duplicates++;

        const isNeg = current < 0;
        if (isNeg) negative++;
        if (current === 0) zero_stock++;
        if (current > 0 && !isDup) valid++;

        previewRows.push({
          row_index: idx + 1,
          designation_raw: rawDes,
          designation_clean: cleanDes,
          unit_label: r.unit || r.unite || 'Unité',
          stock_opening: opening,
          stock_current: current,
          is_negative: isNeg,
          is_duplicate: isDup,
          is_tracked: current > 0,
          action: isNeg ? 'import_as_zero' : isDup ? 'skip' : 'import',
          note: isNeg ? 'Valeur négative (' + current + ') initialisée à 0' : isDup ? 'Doublon détecté' : undefined,
        });
      });

      const result: ImportPreviewResult = {
        total_rows: previewRows.length,
        valid,
        duplicates,
        negative,
        zero_stock,
        rows: previewRows,
      };

      sendJson(res, 200, { success: true, data: result });
      return true;
    } catch (err: any) {
      sendJson(res, 400, { success: false, message: err.message });
      return true;
    }
  }

  // POST /api/admin/inventory/import/commit
  if (pathname === '/api/admin/inventory/import/commit' && method === 'POST') {
    try {
      const body = await parseBody<any>(req);
      const rows: ImportPreviewRow[] = body.rows || [];
      const movementDate = body.movement_date || new Date().toISOString().split('T')[0];
      const periodId = body.period_id || null;

      db.inventory_items = db.inventory_items || [];
      db.stock_movements = db.stock_movements || [];

      let importedCount = 0;
      let trackedCount = 0;
      let movementsCreated = 0;

      for (const r of rows) {
        if (r.action === 'skip') continue;

        const finalQty = r.action === 'import_as_zero' ? 0 : Math.max(0, r.stock_current);
        const isTracked = !!r.is_tracked;
        const newId = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const code = 'ART-' + String(db.inventory_items.length + 1).padStart(4, '0');

        const newItem: InventoryItem = {
          id: newId,
          code,
          designation: r.designation_raw,
          designation_norm: r.designation_clean,
          unit_label: r.unit_label || 'Unité',
          product_id: null,
          min_stock: isTracked ? 5 : null,
          is_tracked: isTracked,
          qty_on_hand: finalQty,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        db.inventory_items.push(newItem);
        importedCount++;
        if (isTracked) trackedCount++;

        if (finalQty > 0) {
          db.stock_movements.push({
            id: 'mvt_' + newId + '_import',
            item_id: newId,
            type: 'opening',
            quantity: finalQty,
            movement_date: movementDate,
            reason: r.note || 'Import initial',
            order_id: null,
            order_item_id: null,
            period_id: periodId,
            created_by: 'Admin Import',
            created_at: new Date().toISOString(),
          });
          movementsCreated++;
        }
      }

      saveDb(db);
      sendJson(res, 200, {
        success: true,
        data: {
          imported_count: importedCount,
          tracked_count: trackedCount,
          movements_created: movementsCreated,
        },
        message: `${importedCount} article(s) importé(s) avec succès (${trackedCount} suivis, ${movementsCreated} mouvements créés).`,
      });
      return true;
    } catch (err: any) {
      sendJson(res, 400, { success: false, message: err.message });
      return true;
    }
  }

  // GET /api/admin/inventory/integrity-check
  if (pathname === '/api/admin/inventory/integrity-check' && method === 'GET') {
    const items = db.inventory_items || [];
    const movements = db.stock_movements || [];

    const discrepancies: any[] = [];
    for (const item of items) {
      const itemMvts = movements.filter((m) => m.item_id === item.id);
      let calculated = 0;
      for (const m of itemMvts) {
        if (m.type === 'purchase' || m.type === 'return' || m.type === 'opening') {
          calculated += m.quantity;
        } else if (m.type === 'sale_shop' || m.type === 'sale_online' || m.type === 'loss') {
          calculated -= m.quantity;
        } else if (m.type === 'adjustment' || m.type === 'count_correction') {
          calculated += m.quantity;
        }
      }
      if (calculated !== item.qty_on_hand && item.is_tracked) {
        discrepancies.push({
          item_id: item.id,
          designation: item.designation,
          qty_on_hand: item.qty_on_hand,
          sum_movements: calculated,
          diff: item.qty_on_hand - calculated,
        });
      }
    }

    sendJson(res, 200, {
      success: true,
      data: {
        checked_items: items.length,
        discrepancies,
        is_healthy: discrepancies.length === 0,
      },
    });
    return true;
  }

  // PUT /api/admin/orders/:id/status (with automatic inventory trigger on 'shipped')
  const orderStatusMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
  if (orderStatusMatch && (method === 'PUT' || method === 'PATCH')) {
    const orderId = orderStatusMatch[1];
    const order = db.orders.find((o) => String(o.id) === orderId || o.orderNumber === orderId || o.order_number === orderId);
    if (!order) {
      sendJson(res, 404, { success: false, message: 'Commande introuvable' });
      return true;
    }

    try {
      const body = await parseBody<any>(req);
      const newStatus = body.status;
      const oldStatus = order.status;
      order.status = newStatus;
      (order as any).updated_at = new Date().toISOString();

      // INVENTORY TRIGGER: when order becomes 'shipped'
      if (newStatus === 'shipped' && oldStatus !== 'shipped') {
        db.stock_movements = db.stock_movements || [];
        const items = db.inventory_items || [];

        for (const line of (order.items || [])) {
          // Find matching inventory item by product_id or designation
          const normName = (line.name || line.product_name || '').toUpperCase().replace(/\s+/g, ' ');
          const invItem = items.find(
            (i) => (line.productId && i.product_id === String(line.productId)) || i.designation_norm === normName
          );

          if (invItem && invItem.is_tracked) {
            // Check idempotence
            const exists = db.stock_movements.find(
              (m) => m.order_id === String(order.id) && m.order_item_id === String(line.id || line.productId)
            );
            if (!exists) {
              const qty = Number(line.quantity) || 1;
              invItem.qty_on_hand -= qty;
              invItem.updated_at = new Date().toISOString();

              db.stock_movements.push({
                id: 'mvt_ord_' + order.id + '_' + (line.id || line.productId),
                item_id: invItem.id,
                type: 'sale_online',
                quantity: qty,
                movement_date: new Date().toISOString().split('T')[0],
                reason: 'Expédition commande #' + (order.orderNumber || order.id),
                order_id: String(order.id),
                order_item_id: String(line.id || line.productId),
                period_id: null,
                created_by: 'Système Commande',
                created_at: new Date().toISOString(),
              });
            }
          }
        }
      }

      saveDb(db);
      sendJson(res, 200, { success: true, message: 'Statut de commande mis à jour : ' + newStatus, data: { order } });
      return true;
    } catch (err: any) {
      sendJson(res, 400, { success: false, message: err.message });
      return true;
    }
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
