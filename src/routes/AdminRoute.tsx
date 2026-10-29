import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { storage } from '../utils/storage';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * Route protégée réservée exclusivement aux administrateurs authentifiés.
 * Exige impérativement une session active et le rôle 'admin' vérifié.
 */
export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  // 1. Accès accordé uniquement si l'utilisateur est authentifié avec le rôle admin actif
  if (isAuthenticated && user?.role === 'admin' && user?.status === 'active') {
    return <>{children}</>;
  }

  // 2. Non connecté → redirection vers la page de connexion
  if (!isAuthenticated) {
    storage.setRedirectAfterLogin(location.pathname + location.search);
    return <Navigate to="/connexion" replace />;
  }

  // 3. Connecté mais rôle non-admin → accès refusé, redirection espace client
  return <Navigate to="/dashboard" replace />;
};
