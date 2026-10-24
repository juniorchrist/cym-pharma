import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { storage } from '../utils/storage';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * Route protégée réservée exclusivement aux administrateurs authentifiés.
 * Vérifie le rôle 'admin' réel de la session.
 */
export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  // Non connecté → redirection vers la page de connexion avec mémorisation de l'URL
  if (!isAuthenticated) {
    storage.setRedirectAfterLogin(location.pathname + location.search);
    return <Navigate to="/connexion" replace />;
  }

  // Connecté mais rôle non-admin → accès refusé, redirection dashboard client
  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
