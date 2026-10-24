import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RegisterPayload, User } from '../types';
import { Auth as AuthService } from '../services/api';
import { storage } from '../utils/storage';
import { verifyAdminPassword } from '../config/adminAccess';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hasAdminAccess: boolean;
  isPendingApproval: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (payload: RegisterPayload) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  checkAdminPassword: (password: string) => boolean;
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
    // Synchronize initial state
    const currentToken = storage.getAuthToken();
    const currentUser = storage.getUser();
    setToken(currentToken);
    setUser(currentUser);
    setHasAdminAccessState(storage.getAdminAccess());
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

  const logout = () => {
    storage.removeAuthToken();
    storage.removeUser();
    storage.setAdminAccess(false);
    setToken(null);
    setUser(null);
    setHasAdminAccessState(false);
  };

  /**
   * Vérifie les droits d'administration.
   * L'accès administrateur requiert une session authentifiée avec le rôle 'admin'.
   * Aucune session fictive ni token inventé n'est créé.
   */
  const checkAdminPassword = (_password: string): boolean => {
    // Si l'utilisateur actuel est authentifié comme admin, l'accès est confirmé
    if (user && user.role === 'admin') {
      storage.setAdminAccess(true);
      setHasAdminAccessState(true);
      return true;
    }
    // Aucun mot de passe en dur ne peut élever les privilèges sans session admin
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
