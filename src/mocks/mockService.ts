import { ApiResponse, Order, Product, User, OrderPricingSummary, PricingLine, RelanceLog } from '../types';
import { MOCK_PRODUCTS } from './products';
import { MOCK_CATEGORIES } from './categories';
import { MOCK_ORDERS } from './orders';
import { MOCK_CLIENT_USER, MOCK_ADMIN_USER, MOCK_USERS_LIST, MOCK_RELANCES } from './users';

/**
 * Routeur de données simulées en cas d'indisponibilité du backend réseau.
 * Les données restent plausibles et strictement isolées dans src/mocks.
 */
export function getMockResponse<T>(
  endpoint: string,
  options: RequestInit = {}
): ApiResponse<T> | null {
  const method = (options.method || 'GET').toUpperCase();
  const cleanPath = endpoint.split('?')[0].replace(/^\/api/, '').replace(/^\//, '');
  const queryString = endpoint.includes('?') ? endpoint.split('?')[1] : '';
  const searchParams = new URLSearchParams(queryString);

  // 1. Catégories
  if (cleanPath === 'categories') {
    return {
      success: true,
      data: { categories: MOCK_CATEGORIES } as unknown as T,
      categories: MOCK_CATEGORIES as unknown as any,
    } as ApiResponse<T>;
  }

  // 2. Produits (liste et détail)
  if (cleanPath === 'products' || cleanPath === 'admin/products') {
    if (method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      const newProd: Product = {
        id: `demo-${Date.now()}`,
        name: body.name || 'Nouveau Produit Démo',
        reference: body.reference || `REF-${Date.now()}`,
        category: body.category || 'Consommables',
        category_main: body.category_main || 'consommables',
        ref_price: body.ref_price || 0,
        price: body.price || body.ref_price || 0,
        stock: body.stock || 50,
        is_active: true,
        unit: body.unit || 'Boîte',
        conditionnement: body.conditionnement || 'Unité',
        description: body.description || '',
        currency: 'FCFA',
      };
      return {
        success: true,
        data: { product: newProd } as unknown as T,
      } as ApiResponse<T>;
    }

    let filtered = [...MOCK_PRODUCTS];
    const cat = searchParams.get('category') || searchParams.get('categorie');
    if (cat) {
      const catLower = cat.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.category?.toLowerCase().includes(catLower) ||
          p.category_main?.toLowerCase() === catLower
      );
    }

    const search = searchParams.get('search') || searchParams.get('q');
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.reference && p.reference.toLowerCase().includes(q))
      );
    }

    return {
      success: true,
      data: {
        products: filtered,
        pagination: { total: filtered.length },
        total: filtered.length,
      } as unknown as T,
      products: filtered as unknown as any,
      total: filtered.length,
    } as ApiResponse<T>;
  }

  if (cleanPath.startsWith('products/')) {
    const id = cleanPath.replace('products/', '');
    const found = MOCK_PRODUCTS.find((p) => String(p.id) === String(id) || p.reference === id);
    if (found) {
      return {
        success: true,
        data: { product: found } as unknown as T,
        product: found as unknown as any,
      } as ApiResponse<T>;
    }
    return {
      success: true,
      data: { product: MOCK_PRODUCTS[0] } as unknown as T,
      product: MOCK_PRODUCTS[0] as unknown as any,
    } as ApiResponse<T>;
  }

  // 3. Commandes
  if (cleanPath === 'orders' || cleanPath === 'admin/orders') {
    if (method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      const newOrder: Order = {
        id: `CMD-DEMO-${Date.now().toString().slice(-4)}`,
        orderNumber: `CMD-DEMO-${Date.now().toString().slice(-4)}`,
        created_at: new Date().toISOString(),
        establishment_name: body.establishment_name || 'Clinique Sainte-Marie',
        shipping_address: body.shipping_address || 'Cocody Danga, Abidjan',
        shipping_city: body.shipping_city || 'Abidjan',
        status: 'En attente de devis',
        total: 0,
        subtotal: 0,
        items: body.items || [],
      };
      return {
        success: true,
        data: { order: newOrder } as unknown as T,
      } as ApiResponse<T>;
    }

    return {
      success: true,
      data: { orders: MOCK_ORDERS } as unknown as T,
      orders: MOCK_ORDERS as unknown as any,
    } as ApiResponse<T>;
  }

  if (cleanPath.startsWith('orders/') || cleanPath.startsWith('admin/orders/')) {
    const parts = cleanPath.split('/');
    const orderId = parts[1] === 'orders' ? parts[2] : parts[1];

    if (cleanPath.includes('/pricing')) {
      const ord = MOCK_ORDERS.find((o) => o.id === orderId || o.orderNumber === orderId) || MOCK_ORDERS[0];
      const lines: PricingLine[] = (ord.items || []).map((it) => {
        const qty = it.quantity || it.qty || 1;
        const price = it.unit_price ?? it.unitPrice ?? 0;
        return {
          productId: it.productId || '1',
          name: it.name || it.product_name || 'Article médical',
          reference: it.reference || 'REF',
          unit: it.unit || 'Boîte',
          quantity: qty,
          ref_price: price,
          unit_price: price,
          line_total: price * qty,
          missing_price: price === 0,
        };
      });
      const pricingSummary: OrderPricingSummary = {
        orderId: ord.id,
        orderNumber: ord.orderNumber || String(ord.id),
        status: ord.status,
        client: ord.establishment_name || 'Clinique Sainte-Marie',
        lines,
        totalQuantity: lines.reduce((acc, l) => acc + l.quantity, 0),
        totalAmount: ord.total || 45000,
        hasMissingPrices: lines.some((l) => l.missing_price),
        canValidate: true,
      };
      return {
        success: true,
        data: { order: ord, pricingSummary } as unknown as T,
      } as ApiResponse<T>;
    }

    const found = MOCK_ORDERS.find((o) => o.id === orderId || o.orderNumber === orderId);
    return {
      success: true,
      data: { order: found || MOCK_ORDERS[0] } as unknown as T,
      order: (found || MOCK_ORDERS[0]) as unknown as any,
    } as ApiResponse<T>;
  }

  // 4. Utilisateurs & Profil
  if (cleanPath === 'users/profile') {
    return {
      success: true,
      data: { user: MOCK_CLIENT_USER } as unknown as T,
      user: MOCK_CLIENT_USER as unknown as any,
    } as ApiResponse<T>;
  }

  if (cleanPath === 'users/dashboard') {
    return {
      success: true,
      data: {
        user: MOCK_CLIENT_USER,
        stats: {
          ordersCount: MOCK_ORDERS.length,
          pendingQuotes: 1,
          invoicesReady: 1,
          delivered: 1,
        },
        recentOrders: MOCK_ORDERS,
      } as unknown as T,
    } as ApiResponse<T>;
  }

  // 5. Administration
  if (cleanPath === 'admin/dashboard') {
    return {
      success: true,
      data: {
        kpis: {
          totalRevenue: 77500,
          ordersCount: MOCK_ORDERS.length,
          pendingQuotes: 1,
          activeClients: 3,
          inactiveClients: 1,
        },
        recentOrders: MOCK_ORDERS,
      } as unknown as T,
    } as ApiResponse<T>;
  }

  if (cleanPath === 'admin/users') {
    return {
      success: true,
      data: { users: MOCK_USERS_LIST } as unknown as T,
      users: MOCK_USERS_LIST as unknown as any,
    } as ApiResponse<T>;
  }

  if (cleanPath === 'admin/relances') {
    return {
      success: true,
      data: { relances: MOCK_RELANCES } as unknown as T,
      relances: MOCK_RELANCES as unknown as any,
    } as ApiResponse<T>;
  }

  if (cleanPath === 'admin/check-inactivity') {
    return {
      success: true,
      data: {
        newlyInactive: [],
        relancesSent: MOCK_RELANCES,
      } as unknown as T,
    } as ApiResponse<T>;
  }

  if (cleanPath.startsWith('admin/users/') && cleanPath.endsWith('/relance')) {
    const userId = cleanPath.split('/')[2];
    const targetUser = MOCK_USERS_LIST.find((u) => u.id === userId) || MOCK_USERS_LIST[1];
    const log: RelanceLog = {
      id: `rel_${Date.now()}`,
      userId: targetUser.id,
      userName: targetUser.name || 'Client',
      establishmentName: targetUser.establishment_name || targetUser.name || 'Clinique',
      recipientEmail: targetUser.email,
      recipientPhone: targetUser.phone,
      sent_at: new Date().toISOString(),
      channel: 'multichannel',
      triggerReason: 'Relance manuelle déclenchée depuis le panneau admin',
      subject: 'CYM Pharma — Réapprovisionnement & Suivi de vos besoins médicaux',
      message: 'Bonjour, notre équipe reste à votre disposition...',
      daysSinceLastOrder: targetUser.days_since_last_order || 65,
      status: 'sent',
    };
    return {
      success: true,
      data: { relance: log, user: targetUser } as unknown as T,
    } as ApiResponse<T>;
  }

  if (cleanPath === 'admin/analytics') {
    return {
      success: true,
      data: {
        revenue: 77500,
        volume: MOCK_ORDERS.length,
        averageBasket: 25833,
      } as unknown as T,
    } as ApiResponse<T>;
  }

  // 6. Contact
  if (cleanPath === 'contact') {
    return {
      success: true,
      message: 'Votre message a bien été transmis au service client CYM Pharma.',
    } as ApiResponse<T>;
  }

  return null;
}
