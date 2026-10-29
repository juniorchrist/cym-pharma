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
  ClientReminder,
  ReminderTemplate,
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

        if (!payload.items || payload.items.length === 0) {
          return { success: false, message: 'La commande doit comporter au moins un article.' };
        }

        const orderData = {
          user_id: currentUser?.id || null,
          establishment_name: payload.establishment_name || (payload as any).establishmentName || '',
          shipping_address: payload.shipping_address || payload.shippingAddress?.street || '',
          shipping_city: payload.shipping_city || payload.shippingAddress?.city || 'Abidjan',
          notes: payload.notes || payload.shippingAddress?.notes || '',
        };

        const itemsData = payload.items.map((it) => ({
          productId: it.productId ? String(it.productId) : null,
          reference: it.reference || null,
          name: it.name || 'Dispositif médical',
          unit: it.unit || 'Unité',
          conditionnement: it.conditionnement || null,
          quantity: it.quantity || 1,
        }));

        // Appel RPC atomique : commande + lignes + historique dans 1 seule transaction ACID
        const { data: rpcResult, error: rpcError } = await supabase.rpc('create_order_atomic', {
          p_order_data: orderData,
          p_items: itemsData,
        });

        if (rpcError) {
          return { success: false, message: rpcError.message || 'Erreur lors de la création de la commande.' };
        }

        if (!rpcResult || !rpcResult.order) {
          return { success: false, message: 'La commande n\'a pas pu être enregistrée.' };
        }

        return { success: true, data: { order: rpcResult.order as Order } };
      } catch (err: any) {
        return { success: false, message: err?.message || 'Erreur lors de la création de la commande.' };
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
    if (isSupabaseConfigured() && supabase) {
      try {
        let query = supabase.from('products').select('*', { count: 'exact' });
        if (params.category) query = query.eq('category', String(params.category));
        if (params.search) query = query.ilike('name', `%${params.search}%`);
        query = query.order('name');
        const { data, count, error } = await query;
        if (!error && data) {
          return { success: true, data: { products: data as unknown as Product[], total: count || data.length } };
        }
      } catch (err) {
        console.warn('Supabase products fallback to HTTP:', err);
      }
    }
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ products: Product[]; total: number }>(`/admin/products${query ? `?${query}` : ''}`);
  },

  async createProduct(product: Partial<Product>): Promise<ApiResponse<{ product: Product }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.from('products').insert(product).select().single();
        if (!error && data) {
          return { success: true, data: { product: data as unknown as Product } };
        }
      } catch (err) {
        console.warn('Supabase createProduct fallback to HTTP:', err);
      }
    }
    return request<{ product: Product }>('/admin/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  },

  async updateProduct(id: string | number, product: Partial<Product>): Promise<ApiResponse<{ product: Product }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.from('products').update(product).eq('id', String(id)).select().single();
        if (!error && data) {
          return { success: true, data: { product: data as unknown as Product } };
        }
      } catch (err) {
        console.warn('Supabase updateProduct fallback to HTTP:', err);
      }
    }
    return request<{ product: Product }>(`/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    });
  },

  async deleteProduct(id: string | number): Promise<ApiResponse<void>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('products').delete().eq('id', String(id));
        if (!error) return { success: true };
      } catch (err) {
        console.warn('Supabase deleteProduct fallback to HTTP:', err);
      }
    }
    return request<void>(`/admin/products/${id}`, {
      method: 'DELETE',
    });
  },

  async users(params: Record<string, string | number> = {}): Promise<ApiResponse<{ users: User[] }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*, client_reminders(id, status, opened_at, template_key)')
          .order('created_at', { ascending: false });
        if (!error && data) {
          const INACTIVITY_DAYS = 60;
          const mapped: User[] = data.map((p: any) => {
            const reminders = Array.isArray(p.client_reminders) ? p.client_reminders : [];
            const latestRem = [...reminders].sort(
              (a: any, b: any) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()
            )[0];

            let daysSince: number | undefined = undefined;
            if (p.last_order_at) {
              daysSince = Math.floor((Date.now() - new Date(p.last_order_at).getTime()) / (1000 * 60 * 60 * 24));
            } else if (p.created_at) {
              daysSince = Math.floor((Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24));
            }
            const isInactive = p.status === 'inactive' || (typeof daysSince === 'number' && daysSince >= INACTIVITY_DAYS);

            return {
              id: p.id,
              name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
              first_name: p.first_name,
              last_name: p.last_name,
              email: p.email,
              phone: p.phone,
              org: p.org || p.establishment_name,
              establishment_name: p.establishment_name,
              establishment_type: p.establishment_type,
              commune: p.commune,
              address: p.address,
              role: p.role,
              status: isInactive ? 'inactive' : p.status,
              created_at: p.created_at,
              last_order_at: p.last_order_at,
              last_reminder_at: p.last_reminder_at,
              latest_reminder_status: latestRem?.status,
              latest_reminder_opened_at: latestRem?.opened_at,
              latest_reminder_id: latestRem?.id,
              days_since_last_order: daysSince,
              is_server_inactive: isInactive,
            } as User;
          });
          return { success: true, data: { users: mapped } };
        }
      } catch (err) {
        console.warn('Supabase users fallback to HTTP:', err);
      }
    }
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ users: User[] }>(`/admin/users${query ? `?${query}` : ''}`);
  },

  async updateUserStatus(id: string | number, status: string): Promise<ApiResponse<void>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('profiles').update({ status }).eq('id', String(id));
        if (!error) return { success: true };
      } catch (err) {
        console.warn('Supabase updateUserStatus fallback to HTTP:', err);
      }
    }
    return request<void>(`/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async updateUserPhone(id: string | number, phone: string): Promise<ApiResponse<{ phone: string; normalized: string }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('profiles').update({ phone }).eq('id', String(id));
        if (!error) {
          return { success: true, data: { phone, normalized: phone } };
        }
      } catch (err) {
        console.warn('Supabase updateUserPhone fallback to HTTP:', err);
      }
    }
    return request<{ phone: string; normalized: string }>(`/admin/users/${id}/phone`, {
      method: 'PATCH',
      body: JSON.stringify({ phone }),
    });
  },

  async reminderTemplates(): Promise<ApiResponse<{ templates: ReminderTemplate[] }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('reminder_templates')
          .select('*')
          .order('is_default', { ascending: false });
        if (!error && data && data.length > 0) {
          return { success: true, data: { templates: data as ReminderTemplate[] } };
        }
      } catch (err) {
        console.warn('Supabase reminderTemplates fallback to HTTP:', err);
      }
    }
    return request<{ templates: ReminderTemplate[] }>('/admin/reminders/templates');
  },

  async updateReminderTemplate(key: string, content: string, title?: string): Promise<ApiResponse<void>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const updatePayload: Record<string, any> = { content, updated_at: new Date().toISOString() };
        if (title) updatePayload.title = title;
        const { error } = await supabase.from('reminder_templates').update(updatePayload).eq('template_key', key);
        if (!error) return { success: true };
      } catch (err) {
        console.warn('Supabase updateReminderTemplate fallback to HTTP:', err);
      }
    }
    return request<void>(`/admin/reminders/templates/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ content, title }),
    });
  },

  async resetReminderTemplates(): Promise<ApiResponse<{ templates: ReminderTemplate[] }>> {
    return request<{ templates: ReminderTemplate[] }>('/admin/reminders/templates/reset', {
      method: 'POST',
    });
  },

  async reminders(): Promise<ApiResponse<{ reminders: ClientReminder[] }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('client_reminders')
          .select('*, profiles:user_id(name, first_name, last_name, phone, establishment_name, email)')
          .order('opened_at', { ascending: false });
        if (!error && data) {
          const mappedReminders: ClientReminder[] = data.map((r: any) => ({
            id: r.id,
            user_id: r.user_id,
            channel: r.channel,
            template_key: r.template_key,
            opened_by: r.opened_by,
            opened_at: r.opened_at,
            confirmed_at: r.confirmed_at,
            status: r.status,
            created_at: r.created_at,
            establishment_name: r.profiles?.establishment_name,
            name: r.profiles?.name,
            first_name: r.profiles?.first_name,
            last_name: r.profiles?.last_name,
            phone: r.profiles?.phone,
            email: r.profiles?.email,
          }));
          return { success: true, data: { reminders: mappedReminders } };
        }
      } catch (err) {
        console.warn('Supabase reminders fallback to HTTP:', err);
      }
    }
    return request<{ reminders: ClientReminder[] }>('/admin/reminders');
  },

  async recordReminder(userId: string | number, templateKey: string): Promise<ApiResponse<{ reminder: ClientReminder }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const userRes = await supabase.auth.getUser();
        const adminId = userRes.data.user?.id || userId;
        const { data, error } = await supabase
          .from('client_reminders')
          .insert({
            user_id: String(userId),
            template_key: templateKey,
            channel: 'whatsapp_manuel',
            opened_by: adminId,
            status: 'opened',
            opened_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (!error && data) {
          return { success: true, data: { reminder: data as ClientReminder } };
        }
      } catch (err) {
        console.warn('Supabase recordReminder fallback to HTTP:', err);
      }
    }
    return request<{ reminder: ClientReminder }>('/admin/reminders', {
      method: 'POST',
      body: JSON.stringify({ userId, templateKey }),
    });
  },

  async confirmReminder(id: string | number): Promise<ApiResponse<{ reminder: ClientReminder }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('client_reminders')
          .update({
            status: 'confirmed',
            confirmed_at: now,
          })
          .eq('id', String(id))
          .select()
          .single();
        if (!error && data) {
          if (data.user_id) {
            await supabase.from('profiles').update({ last_reminder_at: now }).eq('id', data.user_id);
          }
          return { success: true, data: { reminder: data as ClientReminder } };
        }
      } catch (err) {
        console.warn('Supabase confirmReminder fallback to HTTP:', err);
      }
    }
    return request<{ reminder: ClientReminder }>(`/admin/reminders/${id}/confirm`, {
      method: 'POST',
    });
  },

  async cancelReminder(id: string | number): Promise<ApiResponse<{ reminder: ClientReminder }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('client_reminders')
          .update({ status: 'cancelled' })
          .eq('id', String(id))
          .select()
          .single();
        if (!error && data) {
          return { success: true, data: { reminder: data as ClientReminder } };
        }
      } catch (err) {
        console.warn('Supabase cancelReminder fallback to HTTP:', err);
      }
    }
    return request<{ reminder: ClientReminder }>(`/admin/reminders/${id}/cancel`, {
      method: 'POST',
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
