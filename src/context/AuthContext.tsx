import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RegisterPayload, User } from '../types';
import { Auth as AuthService } from '../services/api';
import { storage } from '../utils/storage';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { hasAdminRole } from '../config/adminAccess';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasAdminAccess: boolean;
  isPendingApproval: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (payload: RegisterPayload) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  checkAdminPassword: (emailOrPassword: string, optionalPassword?: string) => Promise<boolean>;
  dismissPendingBanner: () => void;
  showPendingBanner: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => storage.getUser());
  const [token, setToken] = useState<string | null>(() => storage.getAuthToken());
  const [hasAdminAccess, setHasAdminAccessState] = useState<boolean>(() => storage.getAdminAccess());
  const [showPendingBanner, setShowPendingBanner] = useState<boolean>(true);

  useEffect(() => {
    // Synchronise l'état React avec l'état réel de la session Supabase.
    // onAuthStateChange émet immédiatement l'état courant (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED…).
    if (!isSupabaseConfigured() || !supabase) {
      // Fallback non-Supabase : charger depuis le storage local
      const currentToken = storage.getAuthToken();
      const currentUser = storage.getUser();
      setToken(currentToken);
      setUser(currentUser);
      setHasAdminAccessState(storage.getAdminAccess());
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        // Session terminée — remettre à zéro tout l'état local
        storage.removeAuthToken();
        storage.removeUser();
        storage.setAdminAccess(false);
        setToken(null);
        setUser(null);
        setHasAdminAccessState(false);
        return;
      }

      if (session) {
        const newToken = session.access_token;

        // Lire le profil depuis la base pour obtenir le rôle réel (jamais depuis user_metadata)
        const { data: profile } = await supabase!
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        const mappedUser: User = {
          id: session.user.id,
          email: session.user.email || '',
          name: profile?.name || session.user.user_metadata?.name || '',
          first_name: profile?.first_name,
          last_name: profile?.last_name,
          // SÉCURITÉ : le rôle vient UNIQUEMENT du profil PostgreSQL, jamais des métadonnées
          role: profile?.role || 'client',
          establishment_name: profile?.establishment_name,
          phone: profile?.phone,
          status: profile?.status || 'active',
          commune: profile?.commune,
          org: profile?.org,
        };

        storage.setAuthToken(newToken);
        storage.setUser(mappedUser);
        if (mappedUser.role === 'admin') {
          storage.setAdminAccess(true);
          setHasAdminAccessState(true);
        } else {
          storage.setAdminAccess(false);
          setHasAdminAccessState(false);
        }
        setToken(newToken);
        setUser(mappedUser);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const isAuthenticated = Boolean(token && user);
  const isAdmin = user?.role === 'admin';
  const isPendingApproval = Boolean(user && user.status === 'pending');

  const login = async (email: string, password: string) => {
    const res = await AuthService.login(email, password);
    if (res.success && res.data) {
      setToken(res.data.token);
      setUser(res.data.user);
      if (res.data.user.role === 'admin') {
        storage.setAdminAccess(true);
        setHasAdminAccessState(true);
      }
      return { success: true };
    }
    return { success: false, message: res.message || 'Identifiants incorrects' };
  };

  const register = async (payload: RegisterPayload) => {
    const res = await AuthService.register(payload);
    if (res.success && res.data) {
      if (res.data.token) setToken(res.data.token);
      if (res.data.user) setUser(res.data.user);
      return { success: true };
    }
    return { success: false, message: res.message || 'Erreur lors de la création du compte' };
  };

  /**
   * Déconnexion : ferme la session Supabase côté serveur, puis efface l'état local.
   * onAuthStateChange s'occupera de l'état React via l'événement SIGNED_OUT.
   */
  const logout = async (): Promise<void> => {
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[Auth] Erreur lors du signOut Supabase :', err);
      }
    }
    // Nettoyage local immédiat (onAuthStateChange le fera aussi, mais on ne veut pas attendre)
    storage.removeAuthToken();
    storage.removeUser();
    storage.setAdminAccess(false);
    setToken(null);
    setUser(null);
    setHasAdminAccessState(false);
  };

  /**
   * Vérification des privilèges administrateur réels.
   * Valide la session auprès de Supabase / Backend. Aucun mot de passe codé en dur.
   */
  const checkAdminPassword = async (emailOrPassword: string, optionalPassword?: string): Promise<boolean> => {
    // Si l'utilisateur actuel est déjà authentifié avec le rôle admin
    if (user && user.role === 'admin' && user.status === 'active') {
      storage.setAdminAccess(true);
      setHasAdminAccessState(true);
      return true;
    }

    // Sinon, authentifier avec l'email et le mot de passe fournis
    const email = optionalPassword ? emailOrPassword : (user?.email || emailOrPassword);
    const password = optionalPassword ? optionalPassword : emailOrPassword;

    if (!email || !password) return false;

    const res = await login(email, password);
    if (res.success) {
      const refreshedUser = storage.getUser();
      if (refreshedUser && refreshedUser.role === 'admin' && refreshedUser.status === 'active') {
        storage.setAdminAccess(true);
        setHasAdminAccessState(true);
        return true;
      }
    }
    return false;
  };

  const dismissPendingBanner = () => {
    setShowPendingBanner(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isAdmin,
        hasAdminAccess,
        isPendingApproval,
        login,
        register,
        logout,
        checkAdminPassword,
        dismissPendingBanner,
        showPendingBanner,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
