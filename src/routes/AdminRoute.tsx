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

  // 1. Non connecté → redirection vers la page de connexion
  if (!isAuthenticated) {
    storage.setRedirectAfterLogin(location.pathname + location.search);
    return <Navigate to="/connexion" replace />;
  }

  // 2. Accès accordé si authentifié avec le rôle admin
  //    On accepte status 'active' ou undefined (profil pas encore entièrement chargé)
  if (user?.role === 'admin' && (user?.status === 'active' || user?.status === undefined || user?.status === null)) {
    return <>{children}</>;
  }

  // 3. Connecté mais rôle non-admin → accès refusé, redirection espace client
  return <Navigate to="/dashboard" replace />;
};

