import { CartItem, Order, User } from '../types';

export const storage = {
  getAuthToken(): string | null {
    try {
      return localStorage.getItem('cym_auth_token');
    } catch {
      return null;
    }
  },
  setAuthToken(token: string): void {
    try {
      localStorage.setItem('cym_auth_token', token);
    } catch (e) {
      console.warn('Storage error: setAuthToken', e);
    }
  },
  removeAuthToken(): void {
    try {
      localStorage.removeItem('cym_auth_token');
    } catch (e) {
      console.warn('Storage error: removeAuthToken', e);
    }
  },

  getUser(): User | null {
    try {
      const raw = localStorage.getItem('cym_user');
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  setUser(user: User): void {
    try {
      localStorage.setItem('cym_user', JSON.stringify(user));
    } catch (e) {
      console.warn('Storage error: setUser', e);
    }
  },
  removeUser(): void {
    try {
      localStorage.removeItem('cym_user');
    } catch (e) {
      console.warn('Storage error: removeUser', e);
    }
  },

  getCart(): CartItem[] {
    try {
      const raw = localStorage.getItem('cym_cart');
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  },
  setCart(cart: CartItem[]): void {
    try {
      localStorage.setItem('cym_cart', JSON.stringify(cart));
    } catch (e) {
      console.warn('Storage error: setCart', e);
    }
  },
  clearCart(): void {
    try {
      localStorage.removeItem('cym_cart');
    } catch (e) {
      console.warn('Storage error: clearCart', e);
    }
  },

  getAdminAccess(): boolean {
    try {
      return localStorage.getItem('cym_admin_access') === 'true';
    } catch {
      return false;
    }
  },
  setAdminAccess(val: boolean): void {
    try {
      localStorage.setItem('cym_admin_access', val ? 'true' : 'false');
    } catch (e) {
      console.warn('Storage error: setAdminAccess', e);
    }
  },

  getDashPanel(): string | null {
    try {
      return localStorage.getItem('dash_panel');
    } catch {
      return null;
    }
  },
  setDashPanel(panel: string): void {
    try {
      localStorage.setItem('dash_panel', panel);
    } catch (e) {
      console.warn('Storage error: setDashPanel', e);
    }
  },
  clearDashPanel(): void {
    try {
      localStorage.removeItem('dash_panel');
    } catch (e) {
      console.warn('Storage error: clearDashPanel', e);
    }
  },

  getLocalUsers(): (User & { _pwd?: string })[] {
    try {
      const raw = localStorage.getItem('cym_local_users');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  setLocalUsers(users: (User & { _pwd?: string })[]): void {
    try {
      localStorage.setItem('cym_local_users', JSON.stringify(users));
    } catch (e) {
      console.warn('Storage error: setLocalUsers', e);
    }
  },

  getRedirectAfterLogin(): string | null {
    try {
      return sessionStorage.getItem('cym_redirect_after_login');
    } catch {
      return null;
    }
  },
  setRedirectAfterLogin(url: string): void {
    try {
      sessionStorage.setItem('cym_redirect_after_login', url);
    } catch (e) {
      console.warn('Storage error: setRedirectAfterLogin', e);
    }
  },
  clearRedirectAfterLogin(): void {
    try {
      sessionStorage.removeItem('cym_redirect_after_login');
    } catch (e) {
      console.warn('Storage error: clearRedirectAfterLogin', e);
    }
  },

  getBLCurrentOrder(): Order | null {
    try {
      const raw = sessionStorage.getItem('cym_bl_current_order');
      return raw ? (JSON.parse(raw) as Order) : null;
    } catch {
      return null;
    }
  },
  setBLCurrentOrder(order: Order): void {
    try {
      sessionStorage.setItem('cym_bl_current_order', JSON.stringify(order));
    } catch (e) {
      console.warn('Storage error: setBLCurrentOrder', e);
    }
  },
};
