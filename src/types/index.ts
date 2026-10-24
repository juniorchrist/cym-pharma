export interface User {
  id: number | string;
  email: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  role: 'admin' | 'client' | 'pharmacien' | string;
  phone?: string;
  org?: string;
  establishment_name?: string;
  establishment_type?: string;
  commune?: string;
  status?: 'active' | 'pending' | 'inactive' | 'suspended' | string;
  total_orders?: number;
  total_spent?: number;
  created_at?: string;
  last_login_at?: string;
  address_street?: string;
  address_city?: string;
  address_district?: string;
  became_inactive_at?: string;
  last_order_at?: string;
  days_since_last_order?: number;
  last_relance_at?: string;
  relance_count?: number;
  last_relance_channel?: 'whatsapp' | 'email' | 'multichannel';
  last_relance_status?: string;
}

export interface RelanceLog {
  id: string;
  userId: number | string;
  userName: string;
  establishmentName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  channel: 'whatsapp' | 'email' | 'multichannel';
  triggerReason: string;
  lastOrderDate?: string;
  daysSinceLastOrder?: number;
  subject: string;
  message: string;
  status: 'sent' | 'pending' | 'delivered';
  sent_at: string;
  whatsappDirectUrl?: string;
}

export interface Product {
  id: number | string;
  name: string;
  sku?: string;
  reference?: string;
  description_short?: string;
  description?: string;
  category?: string;
  category_main?: string;
  category_sub?: string;
  base_price?: number;
  ref_price?: number; // Private reference price - Admin only
  price?: number;
  oldPrice?: number | null;
  unit?: string;
  conditionnement?: string;
  stock?: number;
  stockQuantity?: number;
  inStock?: boolean;
  brand?: string;
  image?: string;
  image_url?: string;
  gallery?: string[];
  status?: string;
  is_active?: boolean;
  cert_ce?: number | boolean;
  cert_iso13485?: number | boolean;
  featured?: number | boolean;
  is_published?: boolean;
  inventory_item_id?: string | null;
  currency?: string;
}

export * from './inventaire';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  count?: number;
  badge?: string;
  color?: string;
  border?: string;
  bg?: string;
  icon?: string;
}

export interface CartItem {
  id: string; // e.g. "prod-001"
  name: string;
  qty: number;
  reference?: string;
  conditionnement?: string;
  unit?: string;
  image?: string;
}

export interface OrderItem {
  productId?: number | string;
  id?: number | string;
  product_name?: string;
  name?: string;
  product_ref?: string;
  reference?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  conditionnement?: string;
  ref_price?: number | null; // Catalog reference price
  unit_price?: number | null; // Retained / quoted unit price
  unitPrice?: number | null;
  line_total?: number | null; // quantity * unit_price
  missing_price?: boolean;
}

export interface PricingLine {
  productId: string | number;
  name: string;
  reference?: string;
  unit?: string;
  quantity: number;
  ref_price: number | null;
  unit_price: number | null;
  line_total: number | null;
  missing_price: boolean;
}

export interface OrderPricingSummary {
  orderId: string | number;
  orderNumber: string;
  status: string;
  client: string;
  lines: PricingLine[];
  totalQuantity: number;
  totalAmount: number | null;
  hasMissingPrices: boolean;
  canValidate: boolean;
  pricedAt?: string;
}

export interface Order {
  id: number | string;
  orderNumber?: string;
  order_number?: string;
  created_at?: string;
  createdAt?: string;
  status: 'a_chiffrer' | 'À chiffrer' | 'chiffree' | 'Chiffrée' | 'pending' | 'confirmed' | 'validated' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | string;
  establishment_name?: string;
  first_name?: string;
  last_name?: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_notes?: string;
  shipping_method?: string;
  payment_method?: string;
  item_count?: number;
  items: OrderItem[];
  total?: number | null;
  subtotal?: number | null;
  timelineStep?: number;
  priced_at?: string;
  is_priced?: boolean;
  invoice_number?: string;
  invoice_date?: string;
  invoice_sent?: boolean;
  invoice_sent_at?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  token?: string;
  user?: User;
  order?: Order;
  errors?: string[];
  error?: string;
}

export interface RegisterPayload {
  name?: string;
  client?: string;
  responsable?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  establishmentName?: string;
  establishment_name?: string;
  establishment?: string;
  establishmentType?: string;
  establishment_type?: string;
  email: string;
  phone: string;
  password: string;
  commune?: string;
  professionalId?: string | null;
  address?: {
    street?: string;
    city?: string;
    district?: string;
  };
}

export interface CreateOrderItemPayload {
  productId?: number | string;
  name?: string;
  reference?: string;
  unit?: string;
  conditionnement?: string;
  quantity: number;
}

export interface CreateOrderPayload {
  items: CreateOrderItemPayload[];
  establishment_name?: string;
  shipping?: { method: string };
  payment?: { method: string };
  shippingAddress?: {
    street?: string;
    city?: string;
    notes?: string;
  };
  shipping_address?: string;
  shipping_city?: string;
  shipping_notes?: string;
  notes?: string;
}

