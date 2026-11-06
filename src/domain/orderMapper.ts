import { Order, OrderItem } from '../types';
import { normalizeOrderStatus, isPendingQuote } from './orderStatus';

/**
 * Normalise un article de commande provenant de PostgreSQL, MySQL ou d'Express.
 */
export function mapOrderItem(raw: any): OrderItem {
  if (!raw) {
    return {
      name: 'Dispositif médical',
      quantity: 1,
      unit_price: null,
      line_total: null,
    };
  }

  const quantity = Number(raw.quantity ?? raw.qty ?? 1);
  const rawUnitPrice = raw.unit_price ?? raw.unitPrice ?? null;
  const unit_price = rawUnitPrice !== null && !isNaN(Number(rawUnitPrice)) ? Number(rawUnitPrice) : null;
  const rawLineTotal = raw.line_total ?? raw.lineTotal ?? null;
  const line_total = rawLineTotal !== null && !isNaN(Number(rawLineTotal))
    ? Number(rawLineTotal)
    : (unit_price !== null ? unit_price * quantity : null);

  const rawRefPrice = raw.ref_price ?? raw.refPrice ?? null;
  const ref_price = rawRefPrice !== null && !isNaN(Number(rawRefPrice)) ? Number(rawRefPrice) : null;

  return {
    id: raw.id,
    productId: raw.product_id ?? raw.productId ?? raw.id,
    product_id: raw.product_id ?? raw.productId ?? raw.id,
    name: raw.name ?? raw.product_name ?? raw.designation ?? 'Dispositif médical',
    product_name: raw.name ?? raw.product_name ?? raw.designation ?? 'Dispositif médical',
    reference: raw.reference ?? raw.product_ref ?? '',
    unit: raw.unit ?? raw.conditionnement ?? 'Unité',
    conditionnement: raw.conditionnement ?? raw.unit ?? 'Unité',
    quantity,
    qty: quantity,
    ref_price,
    unit_price,
    unitPrice: unit_price,
    line_total,
    missing_price: unit_price === null || unit_price <= 0,
  };
}

/**
 * Normalise un objet Commande complet provenant de l'API ou de Supabase.
 * Réconcilie les propriétés snake_case et camelCase, sécurise les montants et le statut.
 */
export function mapOrder(raw: any): Order {
  if (!raw) {
    throw new Error('[mapOrder] Objet commande brut nul ou indéfini');
  }

  const id = raw.id ?? raw.order_id;
  const orderNumber = raw.order_number ?? raw.orderNumber ?? (id ? `CMD-${String(id).replace('CMD-', '')}` : '');
  const rawStatus = raw.status ?? 'pending_quote';
  const status = normalizeOrderStatus(rawStatus);

  const rawItems = Array.isArray(raw.items)
    ? raw.items
    : (Array.isArray(raw.order_items) ? raw.order_items : []);

  const items = rawItems.map(mapOrderItem);

  // Calcul ou récupération sécurisée du total
  let total: number | null = null;
  if (raw.total !== undefined && raw.total !== null && !isNaN(Number(raw.total))) {
    total = Number(raw.total);
  } else if (raw.total_amount !== undefined && raw.total_amount !== null && !isNaN(Number(raw.total_amount))) {
    total = Number(raw.total_amount);
  } else if (items.length > 0 && items.every((it) => it.unit_price !== null && it.unit_price > 0)) {
    total = items.reduce((sum, it) => sum + (it.line_total || 0), 0);
  }

  // Si le statut est pending_quote, le total ne doit pas être affiché comme un montant définitif
  if (isPendingQuote(status) && (total === 0 || total === null)) {
    total = null;
  }

  const createdAt = raw.created_at ?? raw.createdAt ?? new Date().toISOString();
  const pricedAt = raw.priced_at ?? raw.quoted_at ?? raw.pricedAt ?? null;
  const invoiceNumber = raw.invoice_number ?? raw.invoiceNumber ?? (orderNumber ? `FAC-${orderNumber.replace('CMD-', '')}` : undefined);
  const invoiceDate = raw.invoice_date ?? raw.invoiceDate ?? pricedAt;

  return {
    ...raw,
    id,
    orderNumber,
    order_number: orderNumber,
    status,
    items,
    item_count: raw.item_count ?? raw.itemCount ?? items.length,
    total,
    subtotal: raw.subtotal !== undefined && raw.subtotal !== null ? Number(raw.subtotal) : total,
    created_at: createdAt,
    createdAt,
    priced_at: pricedAt,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    establishment_name: raw.establishment_name ?? raw.establishmentName ?? raw.client ?? 'Établissement client',
    shipping_address: raw.shipping_address ?? raw.shippingAddress ?? '',
    shipping_city: raw.shipping_city ?? raw.shippingCity ?? 'Abidjan',
    shipping_notes: raw.shipping_notes ?? raw.notes ?? '',
  };
}

