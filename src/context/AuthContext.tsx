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
   * Vérifie le mot de passe administrateur (protection côté client uniquement).
   * Si correct :
   *   – marque hasAdminAccess = true
   *   – élève le rôle de l'utilisateur courant à 'admin' dans le state ET dans
   *     localStorage pour que AdminRoute autorise la navigation vers /admin.
   *   – Si aucun utilisateur n'est connecté, crée une session admin locale temporaire.
   * NOTE : sécuriser côté serveur en production.
   */
  const checkAdminPassword = (password: string): boolean => {
    const ok = verifyAdminPassword(password);
    if (ok) {
      storage.setAdminAccess(true);
      setHasAdminAccessState(true);

      const currentUser = storage.getUser();
      const currentToken = storage.getAuthToken();

      if (currentUser) {
        // Élever le rôle à 'admin' pour satisfaire AdminRoute
        if (currentUser.role !== 'admin') {
          const elevatedUser: User = { ...currentUser, role: 'admin' };
          storage.setUser(elevatedUser);
          setUser(elevatedUser);
        }
      } else {
        // Aucune session active : créer un compte admin local temporaire
        const adminUser: User = {
          id: 'admin_local',
          email: 'admin@cympharma.ci',
          name: 'Administrateur CYM',
          role: 'admin',
          status: 'active',
        };
        const fakeToken = currentToken || ('admin_local_' + Date.now());
        if (!currentToken) {
          storage.setAuthToken(fakeToken);
          setToken(fakeToken);
        }
        storage.setUser(adminUser);
        setUser(adminUser);
      }
    }
    return ok;
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
