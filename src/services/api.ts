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
import { API_BASE_URL, getApiBaseUrl, buildApiUrl } from '../config/api';
import { supabase, isSupabaseConfigured } from './supabase';

export { API_BASE_URL };

// Helper pour requêtes HTTP vers le backend
async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // RÈGLE DE SÉCURITÉ : Les tokens sont transmis uniquement aux routes qui nécessitent une authentification
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const isPublicRoute =
    cleanEndpoint.startsWith('/products') ||
    cleanEndpoint.startsWith('/categories') ||
    cleanEndpoint.startsWith('/health') ||
    cleanEndpoint.startsWith('/api/health') ||
    cleanEndpoint.startsWith('/contact') ||
    cleanEndpoint.startsWith('/auth/login') ||
    cleanEndpoint.startsWith('/auth/register');

  const token = storage.getAuthToken();
  if (token && !isPublicRoute) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = buildApiUrl(endpoint);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401 && !isPublicRoute) {
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

/**
 * Calcule l'URL de redirection sécurisée pour les e-mails de confirmation Supabase.
 * Utilise window.location.origin pour être toujours aligné sur l'environnement réel
 * (local dev ou production InfinityFree) sans inventer de nouvelle route.
 */
export function getAuthRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/connexion`;
  }
  return 'https://cympharma.infinityfreeapp.com/connexion';
}

/**
 * Traduit les erreurs d'authentification Supabase en messages clairs et professionnels en français.
 * Protège les clés API et détails d'implémentation conformément aux exigences de sécurité.
 */
export function translateAuthError(error: any): string {
  if (!error) return 'Une erreur inattendue est survenue.';
  const msg = (typeof error === 'string' ? error : error?.message || '').toLowerCase();
  const code = (error?.code || '').toLowerCase();

  if (
    msg.includes('rate limit') ||
    code.includes('rate_limit') ||
    code.includes('over_email_send_rate_limit') ||
    msg.includes('once every') ||
    msg.includes('too many requests')
  ) {
    return "Trop de demandes d'envoi. Pour des raisons de sécurité, veuillez patienter une minute avant de réessayer.";
  }
  if (msg.includes('email not confirmed') || code === 'email_not_confirmed') {
    return "Votre adresse e-mail n'a pas encore été confirmée. Veuillez vérifier votre boîte de réception ou demander un nouveau lien de confirmation ci-dessous.";
  }
  if (msg.includes('already confirmed') || msg.includes('user already confirmed')) {
    return "Cette adresse e-mail est déjà confirmée. Vous pouvez vous connecter directement.";
  }
  if (
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('invalid username or password')
  ) {
    return "Email ou mot de passe incorrect.";
  }
  if (
    msg.includes('smtp') ||
    msg.includes('error sending confirmation email') ||
    msg.includes('error sending')
  ) {
    return "Le service d'envoi d'e-mails rencontre une difficulté temporaire. Veuillez patienter quelques instants ou contacter le support CYM Pharma.";
  }
  if (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('connection')
  ) {
    return "Impossible de joindre le serveur. Veuillez vérifier votre connexion internet et réessayer.";
  }
  if (msg.includes('redirect') || msg.includes('redirect_to')) {
    return "L'URL de redirection n'est pas autorisée dans la configuration Supabase.";
  }
  if (
    msg.includes('invalid email') ||
    msg.includes('email format') ||
    msg.includes('validation')
  ) {
    return "Veuillez saisir une adresse e-mail valide.";
  }

  return error?.message || "Une erreur est survenue lors de l'opération. Veuillez réessayer.";
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
          const isNotConfirmed =
            authError?.message?.toLowerCase().includes('email not confirmed') ||
            authError?.code === 'email_not_confirmed';

          return {
            success: false,
            code: isNotConfirmed ? 'EMAIL_NOT_CONFIRMED' : undefined,
            message: isNotConfirmed
              ? "Votre adresse e-mail n'a pas encore été confirmée. Veuillez cliquer sur le lien reçu par e-mail ou demander un nouveau lien de confirmation ci-dessous."
              : translateAuthError(authError),
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
          message: translateAuthError(err),
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
        const redirectTo = getAuthRedirectUrl();
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: payload.email.trim(),
          password: payload.password,
          options: {
            emailRedirectTo: redirectTo,
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
            message: translateAuthError(authError) || 'Erreur lors de la création du compte',
          };
        }

        const token = authData.session?.access_token || '';
        const user: User = {
          id: authData.user.id,
          email: authData.user.email || payload.email,
          name: payload.name || `${payload.first_name || ''} ${payload.last_name || ''}`.trim(),
          first_name: payload.first_name,
          last_name: payload.last_name,
          role: 'client',
          establishment_name: payload.establishment_name,
          phone: payload.phone,
          status: 'pending',
        };

        // Sauvegarde proactive du profil dans public.profiles
        try {
          await supabase.from('profiles').upsert({
            id: authData.user.id,
            email: user.email,
            name: user.name,
            first_name: payload.first_name || null,
            last_name: payload.last_name || null,
            role: 'client',
            establishment_name: payload.establishment_name || null,
            phone: payload.phone || null,
            status: 'active',
          }, { onConflict: 'id' });
        } catch (profErr) {
          console.warn('[CYM] Direct profile upsert notice:', profErr);
        }

        if (token) {
          storage.setAuthToken(token);
          storage.setUser(user);
          return { success: true, data: { token, user } };
        }

        // Si confirmation requise : pas de token ni de session prématurée
        return {
          success: true,
          code: 'CONFIRMATION_REQUIRED',
          data: { user },
          message:
            'Compte créé avec succès ! Un e-mail de confirmation vous a été envoyé. Veuillez cliquer sur le lien reçu pour activer votre compte.',
        };
      } catch (err: any) {
        return {
          success: false,
          message: translateAuthError(err) || 'Erreur lors de l\'enregistrement',
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

  async resendConfirmationEmail(email: string): Promise<ApiResponse<void>> {
    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      return {
        success: false,
        message: 'Veuillez saisir une adresse e-mail valide avant de demander un renvoi.',
      };
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const redirectTo = getAuthRedirectUrl();
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: trimmedEmail,
          options: {
            emailRedirectTo: redirectTo,
          },
        });

        if (error) {
          return {
            success: false,
            message: translateAuthError(error),
          };
        }

        return {
          success: true,
          message:
            'Une nouvelle demande de confirmation a été prise en compte. Vérifiez votre boîte de réception ainsi que vos courriers indésirables.',
        };
      } catch (err: any) {
        return {
          success: false,
          message: translateAuthError(err),
        };
      }
    }

    const res = await request<void>('/auth/resend-confirmation', {
      method: 'POST',
      body: JSON.stringify({ email: trimmedEmail }),
    });
    return res;
  },
};

// ── Produits (Catalogue public sans prix ni stock privé) ──
export const Products = {
  async list(params: Record<string, string | number> = {}): Promise<ApiResponse<{ products: Product[]; pagination: { total: number } }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        // RÈGLE MÉTIER CYM PHARMA : Le catalogue public interroge la vue public_products
        // qui exclut strictement ref_price, purchase_cost et stocks du schéma SQL.
        let query = supabase.from('public_products').select('*', { count: 'exact' });

        if (params.category) {
          query = query.ilike('category', `%${params.category}%`);
        }
        if (params.search) {
          query = query.or(`name.ilike.%${params.search}%,reference.ilike.%${params.search}%`);
        }

        const { data, error, count } = await query;
        if (!error && data) {
          const sanitizedProducts = data.map((p: any) => ({
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
        }
      } catch (err: any) {
        console.warn('[CYM] Supabase public_products fallback to backend HTTP:', err);
      }
    }

    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ products: Product[]; pagination: { total: number } }>(`/products${query ? `?${query}` : ''}`);
  },

  async get(id: string | number): Promise<ApiResponse<{ product: Product }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('public_products')
          .select('*')
          .eq('id', String(id))
          .single();
        if (!error && data) {
          return {
            success: true,
            data: {
              product: { ...data, ref_price: 0, price: 0 } as Product,
            },
          };
        }
      } catch (err: any) {
        console.warn('[CYM] Supabase public_products get fallback to backend HTTP:', err);
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
        const sessionRes = await supabase.auth.getSession();
        const activeUserId = sessionRes.data?.session?.user?.id || user?.id;

        let query = supabase.from('orders').select('*, items:order_items(*)');

        if (user?.role !== 'admin' && activeUserId) {
          query = query.eq('user_id', activeUserId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (!error && data) {
          const mappedOrders: Order[] = data.map((o: any) => ({
            ...o,
            orderNumber: o.order_number || o.id,
            order_number: o.order_number || o.id,
            item_count: (o.items || []).length,
            items: (o.items || []).map((it: any) => ({
              ...it,
              productId: it.product_id || it.id,
              product_id: it.product_id || it.id,
              quantity: Number(it.quantity) || 1,
              unit_price: Number(it.unit_price) || 0,
              line_total: Number(it.line_total) || 0,
            })),
          }));
          return { success: true, data: { orders: mappedOrders } };
        }
      } catch (err: any) {
        console.warn('[CYM] Supabase orders list fallback to HTTP:', err);
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

        if (!error && data) {
          const mappedOrder: Order = {
            ...data,
            orderNumber: data.order_number || data.id,
            order_number: data.order_number || data.id,
            item_count: (data.items || []).length,
            items: (data.items || []).map((it: any) => ({
              ...it,
              productId: it.product_id || it.id,
              product_id: it.product_id || it.id,
              quantity: Number(it.quantity) || 1,
              unit_price: Number(it.unit_price) || 0,
              line_total: Number(it.line_total) || 0,
            })),
          };
          return { success: true, data: { order: mappedOrder } };
        }
      } catch (err: any) {
        console.warn('[CYM] Supabase orders get fallback to HTTP:', err);
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
        if (!error) return { success: true };
      } catch (err: any) {
        console.warn('[CYM] Supabase orders cancel fallback to HTTP:', err);
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
        if (!error && data) return { success: true, data: { user: data as User } };
      } catch (err: any) {
        console.warn('[CYM] Supabase profile fallback to HTTP:', err);
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
    if (isSupabaseConfigured() && supabase) {
      try {
        let query = supabase
          .from('orders')
          .select('*, items:order_items(*)');

        if (params.status) {
          query = query.eq('status', String(params.status));
        }

        const { data: rawOrders, error } = await query.order('created_at', { ascending: false });

        if (!error && rawOrders) {
          // Enrichir avec les profils clients (puisque user_id lie auth.users)
          const userIds = Array.from(new Set(rawOrders.map((o: any) => o.user_id).filter(Boolean)));
          let profileMap = new Map<string, any>();

          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, name, first_name, last_name, email, phone, establishment_name, commune, address')
              .in('id', userIds);

            if (profiles) {
              profileMap = new Map(profiles.map((p) => [p.id, p]));
            }
          }

          const enrichedOrders: Order[] = rawOrders.map((o: any) => {
            const prof = o.user_id ? profileMap.get(o.user_id) : null;
            const items = Array.isArray(o.items) ? o.items : [];
            const clientName =
              prof?.name ||
              [prof?.first_name, prof?.last_name].filter(Boolean).join(' ') ||
              o.establishment_name ||
              'Client CYM Pharma';

            return {
              id: o.id,
              order_number: o.order_number || o.id,
              orderNumber: o.order_number || o.id,
              user_id: o.user_id,
              userId: o.user_id,
              establishment_name: o.establishment_name || prof?.establishment_name || '',
              shipping_address: o.shipping_address || prof?.address || '',
              shipping_city: o.shipping_city || prof?.commune || 'Abidjan',
              shipping_notes: o.shipping_notes || '',
              status: o.status || 'En attente de chiffrage',
              notes: o.notes || '',
              subtotal: Number(o.subtotal) || 0,
              total: Number(o.total) || 0,
              currency: o.currency || 'FCFA',
              invoice_number: o.invoice_number,
              invoice_date: o.invoice_date,
              priced_at: o.priced_at,
              shipped_at: o.shipped_at,
              delivered_at: o.delivered_at,
              cancelled_at: o.cancelled_at,
              cancel_reason: o.cancel_reason,
              created_at: o.created_at,
              updated_at: o.updated_at,
              item_count: items.length,
              items: items.map((it: any) => ({
                id: it.id,
                order_id: it.order_id,
                productId: it.product_id,
                product_id: it.product_id,
                reference: it.reference,
                name: it.name,
                unit: it.unit,
                conditionnement: it.conditionnement,
                quantity: Number(it.quantity) || 1,
                unit_price: Number(it.unit_price) || 0,
                unitPrice: Number(it.unit_price) || 0,
                line_total: Number(it.line_total) || 0,
                currency: it.currency || 'FCFA',
              })),
              client: prof
                ? {
                    id: prof.id,
                    name: clientName,
                    email: prof.email,
                    phone: prof.phone,
                    establishment_name: prof.establishment_name,
                  }
                : undefined,
              client_name: clientName,
              client_email: prof?.email || undefined,
              client_phone: prof?.phone || undefined,
            } as Order;
          });

          return { success: true, data: { orders: enrichedOrders } };
        }
      } catch (err) {
        console.warn('[CYM] Supabase Admin.orders fallback to HTTP:', err);
      }
    }

    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ orders: Order[] }>(`/admin/orders${query ? `?${query}` : ''}`);
  },

  async getOrderPricing(orderId: string | number): Promise<ApiResponse<{ order: Order; pricingSummary: OrderPricingSummary }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data: order, error } = await supabase
          .from('orders')
          .select('*, items:order_items(*)')
          .eq('id', String(orderId))
          .maybeSingle();

        if (!error && order) {
          const items = Array.isArray(order.items) ? order.items : [];

          // Récupérer les prix de référence depuis la table products pour pré-remplissage
          const productIds = items.map((it: any) => it.product_id).filter(Boolean);
          let refPriceMap = new Map<string, number>();

          if (productIds.length > 0) {
            const { data: prods } = await supabase
              .from('products')
              .select('id, ref_price')
              .in('id', productIds);

            if (prods) {
              refPriceMap = new Map(prods.map((p) => [String(p.id), Number(p.ref_price) || 0]));
            }
          }

          const lines: PricingLine[] = items.map((it: any) => {
            const refPrice = refPriceMap.get(String(it.product_id)) ?? 0;
            const currentUnitPrice = Number(it.unit_price) || 0;
            const unitPrice = currentUnitPrice > 0 ? currentUnitPrice : refPrice;
            const qty = Number(it.quantity) || 1;
            const lineTotal = unitPrice * qty;

            return {
              productId: it.product_id || it.id,
              name: it.name || 'Dispositif médical',
              reference: it.reference || '',
              unit: it.unit || 'Unité',
              quantity: qty,
              ref_price: refPrice > 0 ? refPrice : null,
              unit_price: currentUnitPrice > 0 ? currentUnitPrice : (refPrice > 0 ? refPrice : null),
              line_total: lineTotal > 0 ? lineTotal : null,
              missing_price: unitPrice <= 0,
            };
          });

          const totalQuantity = lines.reduce((acc, l) => acc + l.quantity, 0);
          const totalAmount = lines.reduce((acc, l) => acc + (l.line_total || 0), 0);
          const hasMissingPrices = lines.some((l) => l.missing_price);

          const pricingSummary: OrderPricingSummary = {
            orderId: order.id,
            orderNumber: order.order_number || order.id,
            status: order.status,
            client: order.establishment_name || 'Établissement',
            lines,
            totalQuantity,
            totalAmount: totalAmount > 0 ? totalAmount : null,
            hasMissingPrices,
            canValidate: !hasMissingPrices && totalAmount > 0,
            pricedAt: order.priced_at,
          };

          return { success: true, data: { order: order as Order, pricingSummary } };
        }
      } catch (err) {
        console.warn('[CYM] Supabase Admin.getOrderPricing fallback to HTTP:', err);
      }
    }

    return request<{ order: Order; pricingSummary: OrderPricingSummary }>(`/admin/orders/${orderId}/pricing`);
  },

  async saveOrderPricing(
    orderId: string | number,
    items: { productId: string | number; unit_price: number; reference?: string }[]
  ): Promise<ApiResponse<{ order: Order }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        let computedTotal = 0;

        for (const item of items) {
          const unitPrice = Number(item.unit_price) || 0;
          // Trouver la ligne de commande correspondante
          const { data: itemRows } = await supabase
            .from('order_items')
            .select('id, quantity')
            .eq('order_id', String(orderId))
            .or(`product_id.eq.${item.productId},id.eq.${item.productId}`);

          if (itemRows && itemRows.length > 0) {
            for (const row of itemRows) {
              const lineTotal = unitPrice * (Number(row.quantity) || 1);
              computedTotal += lineTotal;
              await supabase
                .from('order_items')
                .update({ unit_price: unitPrice, line_total: lineTotal })
                .eq('id', row.id);
            }
          }
        }

        // Mettre à jour la commande
        await supabase
          .from('orders')
          .update({
            subtotal: computedTotal,
            total: computedTotal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', String(orderId));

        const { data: updatedOrder } = await supabase
          .from('orders')
          .select('*, items:order_items(*)')
          .eq('id', String(orderId))
          .single();

        return { success: true, data: { order: updatedOrder as Order } };
      } catch (err: any) {
        console.warn('[CYM] Supabase saveOrderPricing fallback to HTTP:', err);
      }
    }

    return request<{ order: Order }>(`/admin/orders/${orderId}/save-pricing`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  async validateOrderPricing(
    orderId: string | number,
    items: { productId: string | number; unit_price: number; reference?: string }[]
  ): Promise<ApiResponse<{ order: Order }>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        let computedTotal = 0;

        for (const item of items) {
          const unitPrice = Number(item.unit_price) || 0;
          const { data: itemRows } = await supabase
            .from('order_items')
            .select('id, quantity')
            .eq('order_id', String(orderId))
            .or(`product_id.eq.${item.productId},id.eq.${item.productId}`);

          if (itemRows && itemRows.length > 0) {
            for (const row of itemRows) {
              const lineTotal = unitPrice * (Number(row.quantity) || 1);
              computedTotal += lineTotal;
              await supabase
                .from('order_items')
                .update({ unit_price: unitPrice, line_total: lineTotal })
                .eq('id', row.id);
            }
          }
        }

        const now = new Date().toISOString();
        const invoiceNum = `FAC-${String(orderId).replace('CMD-', '')}`;

        await supabase
          .from('orders')
          .update({
            status: 'Devis envoyé',
            subtotal: computedTotal,
            total: computedTotal,
            priced_at: now,
            invoice_number: invoiceNum,
            invoice_date: now,
            updated_at: now,
          })
          .eq('id', String(orderId));

        // Enregistrer dans l'historique
        const userRes = await supabase.auth.getUser();
        await supabase.from('order_status_history').insert({
          order_id: String(orderId),
          status: 'Devis envoyé',
          note: `Chiffrage validé : ${computedTotal} FCFA`,
          changed_by: userRes.data.user?.id || null,
        });

        const { data: updatedOrder } = await supabase
          .from('orders')
          .select('*, items:order_items(*)')
          .eq('id', String(orderId))
          .single();

        return { success: true, data: { order: updatedOrder as Order } };
      } catch (err: any) {
        console.warn('[CYM] Supabase validateOrderPricing fallback to HTTP:', err);
      }
    }

    return request<{ order: Order }>(`/admin/orders/${orderId}/validate-pricing`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  async updateOrderStatus(id: string | number, status: string): Promise<ApiResponse<void>> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const updatePayload: Record<string, any> = {
          status,
          updated_at: new Date().toISOString(),
        };

        if (status === 'Livrée' || status === 'delivered') {
          updatePayload.delivered_at = new Date().toISOString();
        } else if (status === 'Expédiée' || status === 'shipped') {
          updatePayload.shipped_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', String(id));

        if (!error) {
          const userRes = await supabase.auth.getUser();
          await supabase.from('order_status_history').insert({
            order_id: String(id),
            status,
            note: `Statut mis à jour par l'administrateur`,
            changed_by: userRes.data.user?.id || null,
          });
          return { success: true };
        }
      } catch (err) {
        console.warn('[CYM] Supabase updateOrderStatus fallback to HTTP:', err);
      }
    }

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
