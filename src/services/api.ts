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
import { getMockResponse, setDemoMode } from '../mocks';

export { API_BASE_URL };

// Helper pour requêtes HTTP
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
        message: 'Session expirée',
      };
    }

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = (await response.json()) as ApiResponse<T>;
    setDemoMode(false);
    return data;
  } catch (error) {
    console.warn(`API call failed to ${url}:`, error);
    setDemoMode(true);
    const mock = getMockResponse<T>(endpoint, options);
    if (mock) {
      return mock;
    }
    return {
      success: false,
      message: 'Impossible de contacter le serveur',
    };
  }
}

// ── Auth ──
export const Auth = {
  async login(email: string, password: string): Promise<ApiResponse<{ token: string; user: User }>> {
    const res = await request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.success && res.data?.token) {
      storage.setAuthToken(res.data.token);
      if (res.data.user) {
        storage.setUser(res.data.user);
      }
      return res;
    }

    // Fallback auth locale offline
    const localUsers = storage.getLocalUsers();
    const found = localUsers.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
    if (found && found._pwd === password) {
      const { _pwd: _, ...userData } = found;
      const fakeToken = 'local_' + userData.id + '_' + Date.now();
      storage.setAuthToken(fakeToken);
      storage.setUser(userData);
      return {
        success: true,
        data: { token: fakeToken, user: userData },
        user: userData,
        token: fakeToken,
      };
    }

    // Default sample accounts
    if (email === 'admin@cympharma.ci' && (password === 'admin2026' || password === 'admin')) {
      const adminUser: User = {
        id: 'usr_admin',
        email: 'admin@cympharma.ci',
        name: 'Administrateur Central',
        role: 'admin',
        org: 'CYM Pharma Siège Abidjan',
        status: 'active',
      };
      const fakeToken = 'admin_jwt_' + Date.now();
      storage.setAuthToken(fakeToken);
      storage.setUser(adminUser);
      storage.setAdminAccess(true);
      return { success: true, data: { token: fakeToken, user: adminUser }, user: adminUser };
    }

    if (email.includes('pharmacie') || email.includes('clinique') || email.includes('irys')) {
      const clientUser: User = {
        id: 'usr_sample',
        email,
        name: 'Dr. Marie Konan',
        first_name: 'Dr. Marie',
        last_name: 'Konan',
        role: 'client',
        org: 'Clinique Sainte-Marie',
        establishment_name: 'Clinique Sainte-Marie',
        phone: '+225 07 12 34 56 78',
        commune: 'Cocody',
        status: 'active',
      };
      const fakeToken = 'client_jwt_' + Date.now();
      storage.setAuthToken(fakeToken);
      storage.setUser(clientUser);
      return { success: true, data: { token: fakeToken, user: clientUser }, user: clientUser };
    }

    return res;
  },

  async register(payload: RegisterPayload): Promise<ApiResponse<{ token?: string; user?: User }>> {
    const res = await request<{ token?: string; user?: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res.success && res.data) {
      if (res.data.token) storage.setAuthToken(res.data.token);
      if (res.data.user) storage.setUser(res.data.user);
      return res;
    }

    // Fallback inscription locale
    const localUsers = storage.getLocalUsers();
    const existing = localUsers.find((u) => u.email.toLowerCase() === payload.email.toLowerCase());
    if (existing) {
      return { success: false, message: 'Un compte avec cet email existe déjà.' };
    }

    const userId = 'u_' + Date.now();
    const fullName = payload.responsable || payload.client || payload.name || 'Client';
    const newUser: User = {
      id: userId,
      email: payload.email.toLowerCase(),
      name: fullName,
      first_name: payload.firstName || fullName.split(' ')[0],
      last_name: payload.lastName || fullName.split(' ').slice(1).join(' '),
      role: 'client',
      phone: payload.phone,
      org: payload.client || payload.establishmentName,
      establishment_name: payload.client || payload.establishmentName,
      commune: payload.commune || 'Abidjan',
      status: 'active',
      created_at: new Date().toISOString(),
    };

    localUsers.push({ ...newUser, _pwd: payload.password });
    storage.setLocalUsers(localUsers);

    const fakeToken = 'local_' + userId + '_' + Date.now();
    storage.setAuthToken(fakeToken);
    storage.setUser(newUser);

    return {
      success: true,
      data: { token: fakeToken, user: newUser },
      user: newUser,
      token: fakeToken,
    };
  },
};

// ── Products ──
export const Products = {
  async list(params: Record<string, string | number> = {}): Promise<ApiResponse<{ products: Product[]; pagination: { total: number } }>> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    const res = await request<{ products: Product[]; pagination: { total: number } }>(`/products${query ? `?${query}` : ''}`);
    return res;
  },

  async get(id: string | number): Promise<ApiResponse<{ product: Product }>> {
    return request<{ product: Product }>(`/products/${id}`);
  },

  async categories(): Promise<ApiResponse<{ categories: string[] }>> {
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

// ── Orders ──
export const Orders = {
  async create(payload: CreateOrderPayload): Promise<ApiResponse<{ order: Order }>> {
    const res = await request<{ order: Order }>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async list(params: Record<string, string | number> = {}): Promise<ApiResponse<{ orders: Order[] }>> {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ orders: Order[] }>(`/orders${query ? `?${query}` : ''}`);
  },

  async get(id: string | number): Promise<ApiResponse<{ order: Order }>> {
    return request<{ order: Order }>(`/orders/${id}`);
  },

  async cancel(id: string | number, reason: string): Promise<ApiResponse<void>> {
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
      return await res.json();
    } catch {
      return {};
    }
  },
};

// ── Invoices ──
export const Invoices = {
  async download(orderId: string | number): Promise<void> {
    const token = storage.getAuthToken();
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/invoices/orders/${orderId}/invoice`;
    window.open(token ? `${url}?token=${encodeURIComponent(token)}` : url, '_blank');
  },
};

// ── Users ──
export const Users = {
  async getProfile(): Promise<ApiResponse<{ user: User }>> {
    return request<{ user: User }>('/users/profile');
  },

  async updateProfile(data: Partial<User>): Promise<ApiResponse<{ user: User }>> {
    return request<{ user: User }>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async updatePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<void>> {
    return request<void>('/users/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async dashboard(): Promise<ApiResponse<{ user: User; stats: Record<string, number>; recentOrders: Order[] }>> {
    return request<{ user: User; stats: Record<string, number>; recentOrders: Order[] }>('/users/dashboard');
  },
};

// ── Admin ──
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
    return request<void>('/contact', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

// Global CYM object alias for legacy compatibility
export const CYM = {
  Auth,
  Products,
  Orders,
  Invoices,
  Users,
  Admin,
  Contact,
};
