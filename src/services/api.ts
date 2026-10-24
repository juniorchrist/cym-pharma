/**
 * src/services/api.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Couche de services API pour CYM Pharma.
 *
 * Architecture :
 *  1. Supabase (source de vérité principale quand VITE_SUPABASE_URL et
 *     VITE_SUPABASE_PUBLISHABLE_KEY sont configurés).
 *  2. Backend HTTP configurable via VITE_API_URL (InfinityFree / o2switch).
 *  3. AUCUNE donnée fictive ni fallback mocké en cas de panne. En cas d'erreur réseau,
 *     une erreur explicite est renvoyée pour afficher un état d'erreur ou vide clair.
 */

import {
  ApiResponse,
  CreateOrderPayload,
  Order,
  OrderPricingSummary,
  PricingLine,
  Product,
  RegisterPayload,
  User,
  RelanceLog,
} from '../types';
import { storage } from '../utils/storage';
import { API_BASE_URL, getApiBaseUrl } from '../config/api';
import { supabase, isSupabaseConfigured } from './supabase';

export { API_BASE_URL };

// Helper pour requêtes HTTP vers le backend
async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = storage.getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      storage.removeAuthToken();
      storage.removeUser();
      return {
        success: false,
        message: 'Session expirée. Veuillez vous reconnecter.',
      };
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      return {
        success: false,
        message: errJson.message || `Erreur serveur (HTTP ${response.status})`,
      };
    }

    const data = (await response.json()) as ApiResponse<T>;
    return data;
  } catch (error) {
    console.warn(`[CYM API] Échec de la requête vers ${url}:`, error);
    return {
      success: false,
      message: 'Impossible de contacter le serveur CYM Pharma. Veuillez vérifier votre connexion.',
    };
  }
}

// ── Authentification ──
export const Auth = {
  async login(email: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError || !authData.user || !authData.session) {
          return {
            success: false,
            message: authError?.message || 'Identifiants de connexion incorrects',
          };
        }

        const token = authData.session.access_token;
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        const user: User = {
          id: authData.user.id,
          email: authData.user.email || email,
          name: profile?.name || authData.user.user_metadata?.name || '',
          first_name: profile?.first_name,
          last_name: profile?.last_name,
          role: profile?.role || (authData.user.user_metadata?.role as 'admin' | 'client') || 'client',
          establishment_name: profile?.establishment_name,
          phone: profile?.phone,
          status: profile?.status || 'active',
        };

        storage.setAuthToken(token);
        storage.setUser(user);
        if (user.role === 'admin') {
          storage.setAdminAccess(true);
        }

        return { success: true, data: { token, user } };
      } catch (err: any) {
        return {
          success: false,
          message: err?.message || 'Erreur lors de la connexion à Supabase',
        };
      }
    }

    const res = await request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.success && res.data?.token) {
      storage.setAuthToken(res.data.token);
      if (res.data.user) {
        storage.setUser(res.data.user);
        if (res.data.user.role === 'admin') {
          storage.setAdminAccess(true);
        }
      }
    }

    return res;
  },

  async register(payload: RegisterPayload): Promise<ApiResponse<{ token?: string; user?: User }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: payload.email.trim(),
          password: payload.password,
          options: {
            data: {
              name: payload.name || `${payload.first_name || ''} ${payload.last_name || ''}`.trim(),
              role: 'client',
              establishment_name: payload.establishment_name,
              phone: payload.phone,
            },
          },
        });

        if (authError || !authData.user) {
          return {
            success: false,
            message: authError?.message || 'Erreur lors de la création du compte',
          };
        }

        const token = authData.session?.access_token || '';
        const user: User = {
          id: authData.user.id,
          email: authData.user.email || payload.email,
          name: payload.name || `${payload.first_name || ''} ${payload.last_name || ''}`.trim(),
          role: 'client',
          establishment_name: payload.establishment_name,
          phone: payload.phone,
          status: 'pending',
        };

        if (token) storage.setAuthToken(token);
        storage.setUser(user);

        return { success: true, data: { token, user } };
      } catch (err: any) {
        return {
          success: false,
          message: err?.message || 'Erreur lors de l\'enregistrement',
        };
      }
    }

    const res = await request<{ token?: string; user?: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res.success && res.data) {
      if (res.data.token) storage.setAuthToken(res.data.token);
      if (res.data.user) storage.setUser(res.data.user);
    }

    return res;
  },
};

// ── Produits (Catalogue public sans prix ni stock privé) ──
export const Products = {
  async list(params: Record<string, string | number> = {}): Promise<ApiResponse<{ products: Product[]; pagination: { total: number } }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        let query = supabase.from('products').select('*', { count: 'exact' }).eq('is_active', true).eq('is_published', true);

        if (params.category) {
          query = query.ilike('category', `%${params.category}%`);
        }
        if (params.search) {
          query = query.or(`name.ilike.%${params.search}%,reference.ilike.%${params.search}%`);
        }

        const { data, error, count } = await query;
        if (error) {
          return { success: false, message: error.message };
        }

        // Nettoyer les prix pour l'espace public (règle de confidentialité CYM Pharma)
        const sanitizedProducts = (data || []).map((p: any) => ({
          ...p,
          ref_price: 0,
          price: 0,
          stock: undefined,
          qty_on_hand: undefined,
        })) as Product[];

        return {
          success: true,
          data: {
            products: sanitizedProducts,
            pagination: { total: count ?? sanitizedProducts.length },
          },
        };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Erreur de chargement du catalogue' };
      }
    }

    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ products: Product[]; pagination: { total: number } }>(`/products${query ? `?${query}` : ''}`);
  },

  async get(id: string | number): Promise<ApiResponse<{ product: Product }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.from('products').select('*').eq('id', String(id)).single();
        if (error || !data) return { success: false, message: 'Produit introuvable' };
        return {
          success: true,
          data: {
            product: { ...data, ref_price: 0, price: 0 } as Product,
          },
        };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Erreur lors de la récupération du produit' };
      }
    }
    return request<{ product: Product }>(`/products/${id}`);
  },

  async categories(): Promise<ApiResponse<{ categories: string[] }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.from('categories').select('name').eq('is_active', true).order('sort_order');
        if (!error && data) {
          return {
            success: true,
            data: { categories: data.map((c: any) => c.name) },
          };
        }
      } catch {
        // Fallback to request
      }
    }
    return request<{ categories: string[] }>('/categories');
  },

  async create(product: Partial<Product>): Promise<ApiResponse<{ product: Product }>> {
    return request<{ product: Product }>('/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  },

  async update(id: string | number, product: Partial<Product>): Promise<ApiResponse<{ product: Product }>> {
    return request<{ product: Product }>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    });
  },

  async delete(id: string | number): Promise<ApiResponse<void>> {
    return request<void>(`/products/${id}`, {
      method: 'DELETE',
    });
  },
};

// ── Commandes ──
export const Orders = {
  async create(payload: CreateOrderPayload): Promise<ApiResponse<{ order: Order }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const currentUser = storage.getUser();
        const orderNumber = 'CMD-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);
        const estName = payload.establishment_name || (payload as any).establishmentName || '';
        const shipAddress = payload.shipping_address || payload.shippingAddress?.street || '';
        const shipCity = payload.shipping_city || payload.shippingAddress?.city || 'Abidjan';
        const shipNotes = payload.notes || payload.shippingAddress?.notes || '';

        const { data: orderData, error: orderErr } = await supabase
          .from('orders')
          .insert({
            order_number: orderNumber,
            user_id: currentUser?.id || null,
            establishment_name: estName,
            shipping_address: shipAddress,
            shipping_city: shipCity,
            shipping_notes: shipNotes,
            notes: shipNotes,
            status: 'En attente de devis',
          })
          .select()
          .single();

        if (orderErr) {
          return { success: false, message: orderErr.message };
        }

        if (payload.items && payload.items.length > 0) {
          const itemsToInsert = payload.items.map((it) => ({
            order_id: orderData.id,
            product_id: it.productId ? String(it.productId) : null,
            reference: it.reference || null,
            name: it.name || 'Produit',
            unit: it.unit || 'Unité',
            conditionnement: it.conditionnement || null,
            quantity: it.quantity || 1,
            unit_price: 0,
            line_total: 0,
          }));

          await supabase.from('order_items').insert(itemsToInsert);
        }

        const completeOrder: Order = {
          ...orderData,
          items: (payload.items || []) as any,
        };

        return { success: true, data: { order: completeOrder } };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Erreur lors de la création de la commande' };
      }
    }

    return request<{ order: Order }>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async list(params: Record<string, string | number> = {}): Promise<ApiResponse<{ orders: Order[] }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const user = storage.getUser();
        let query = supabase.from('orders').select('*, items:order_items(*)');

        if (user?.role !== 'admin' && user?.id) {
          query = query.eq('user_id', user.id);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) return { success: false, message: error.message };
        return { success: true, data: { orders: (data || []) as Order[] } };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Erreur lors du chargement des commandes' };
      }
    }

    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ orders: Order[] }>(`/orders${query ? `?${query}` : ''}`);
  },

  async get(id: string | number): Promise<ApiResponse<{ order: Order }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, items:order_items(*)')
          .or(`id.eq.${id},order_number.eq.${id}`)
          .maybeSingle();

        if (error || !data) {
          return { success: false, message: 'Commande introuvable' };
        }
        return { success: true, data: { order: data as Order } };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Erreur de récupération' };
      }
    }
    return request<{ order: Order }>(`/orders/${id}`);
  },

  async cancel(id: string | number, reason: string): Promise<ApiResponse<void>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase
          .from('orders')
          .update({ status: 'Annulée', cancel_reason: reason, cancelled_at: new Date().toISOString() })
          .eq('id', String(id));
        if (error) return { success: false, message: error.message };
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Erreur lors de l\'annulation' };
      }
    }
    return request<void>(`/orders/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
  },

  async updateStatus(id: string | number, status: string, note?: string): Promise<ApiResponse<void>> {
    return request<void>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
  },

  async showPhp(id: string | number): Promise<{ order?: Order }> {
    try {
      const token = storage.getAuthToken();
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/orders/show.php?id=${encodeURIComponent(id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return {};
      return await res.json();
    } catch {
      return {};
    }
  },
};

// ── Factures ──
export const Invoices = {
  async download(orderId: string | number): Promise<void> {
    const token = storage.getAuthToken();
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/invoices/orders/${orderId}/invoice`;
    window.open(token ? `${url}?token=${encodeURIComponent(token)}` : url, '_blank');
  },
};

// ── Profils Utilisateurs ──
export const Users = {
  async getProfile(): Promise<ApiResponse<{ user: User }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const currentUser = storage.getUser();
        if (!currentUser?.id) return { success: false, message: 'Non authentifié' };
        const { data, error } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
        if (error) return { success: false, message: error.message };
        return { success: true, data: { user: data as User } };
      } catch (err: any) {
        return { success: false, message: err?.message };
      }
    }
    return request<{ user: User }>('/users/profile');
  },

  async updateProfile(data: Partial<User>): Promise<ApiResponse<{ user: User }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const currentUser = storage.getUser();
        if (!currentUser?.id) return { success: false, message: 'Non authentifié' };
        const { data: updated, error } = await supabase
          .from('profiles')
          .update(data)
          .eq('id', currentUser.id)
          .select()
          .single();
        if (error) return { success: false, message: error.message };
        return { success: true, data: { user: updated as User } };
      } catch (err: any) {
        return { success: false, message: err?.message };
      }
    }
    return request<{ user: User }>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async updatePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) return { success: false, message: error.message };
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err?.message };
      }
    }
    return request<void>('/users/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async dashboard(): Promise<ApiResponse<{ user: User; stats: Record<string, number>; recentOrders: Order[] }>> {
    return request<{ user: User; stats: Record<string, number>; recentOrders: Order[] }>('/users/dashboard');
  },
};

// ── Espace Administration ──
export const Admin = {
  async dashboard(): Promise<ApiResponse<unknown>> {
    return request('/admin/dashboard');
  },

  async products(params: Record<string, string | number> = {}): Promise<ApiResponse<{ products: Product[]; total: number }>> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ products: Product[]; total: number }>(`/admin/products${query ? `?${query}` : ''}`);
  },

  async createProduct(product: Partial<Product>): Promise<ApiResponse<{ product: Product }>> {
    return request<{ product: Product }>('/admin/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  },

  async updateProduct(id: string | number, product: Partial<Product>): Promise<ApiResponse<{ product: Product }>> {
    return request<{ product: Product }>(`/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    });
  },

  async deleteProduct(id: string | number): Promise<ApiResponse<void>> {
    return request<void>(`/admin/products/${id}`, {
      method: 'DELETE',
    });
  },

  async users(params: Record<string, string | number> = {}): Promise<ApiResponse<{ users: User[] }>> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ users: User[] }>(`/admin/users${query ? `?${query}` : ''}`);
  },

  async updateUserStatus(id: string | number, status: string): Promise<ApiResponse<void>> {
    return request<void>(`/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async relances(): Promise<ApiResponse<{ relances: RelanceLog[] }>> {
    return request<{ relances: RelanceLog[] }>('/admin/relances');
  },

  async sendRelance(
    userId: string | number,
    payload?: { subject?: string; message?: string; channel?: string }
  ): Promise<ApiResponse<{ relance: RelanceLog; user: User }>> {
    return request<{ relance: RelanceLog; user: User }>(`/admin/users/${userId}/relance`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async checkInactivity(): Promise<ApiResponse<{ newlyInactive: User[]; relancesSent: RelanceLog[] }>> {
    return request<{ newlyInactive: User[]; relancesSent: RelanceLog[] }>('/admin/check-inactivity', {
      method: 'POST',
    });
  },

  async orders(params: Record<string, string | number> = {}): Promise<ApiResponse<{ orders: Order[] }>> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ orders: Order[] }>(`/admin/orders${query ? `?${query}` : ''}`);
  },

  async getOrderPricing(orderId: string | number): Promise<ApiResponse<{ order: Order; pricingSummary: OrderPricingSummary }>> {
    return request<{ order: Order; pricingSummary: OrderPricingSummary }>(`/admin/orders/${orderId}/pricing`);
  },

  async saveOrderPricing(
    orderId: string | number,
    items: { productId: string | number; unit_price: number; reference?: string }[]
  ): Promise<ApiResponse<{ order: Order }>> {
    return request<{ order: Order }>(`/admin/orders/${orderId}/save-pricing`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  async validateOrderPricing(
    orderId: string | number,
    items: { productId: string | number; unit_price: number; reference?: string }[]
  ): Promise<ApiResponse<{ order: Order }>> {
    return request<{ order: Order }>(`/admin/orders/${orderId}/validate-pricing`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  async updateOrderStatus(id: string | number, status: string): Promise<ApiResponse<void>> {
    return request<void>(`/admin/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  async analytics(period: string): Promise<ApiResponse<unknown>> {
    return request(`/admin/analytics?period=${encodeURIComponent(period)}`);
  },
};

// ── Contact ──
export const Contact = {
  async send(payload: { name: string; email: string; subject: string; message: string; phone?: string; org?: string }): Promise<ApiResponse<void>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('contact_messages').insert({
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          org: payload.org,
          subject: payload.subject,
          message: payload.message,
        });
        if (error) return { success: false, message: error.message };
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err?.message };
      }
    }
    return request<void>('/contact', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

import { InventaireService } from './inventaire';
export { InventaireService };

export const CYM = {
  Auth,
  Products,
  Orders,
  Invoices,
  Users,
  Admin,
  Contact,
  Inventaire: InventaireService,
};
