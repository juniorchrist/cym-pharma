import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { storage } from '../utils/storage';
import { AdminLockModal } from '../components/admin/AdminLockModal';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAuthenticated, user, hasAdminAccess } = useAuth();
  const location = useLocation();
  const [modalOpen, setModalOpen] = useState(!hasAdminAccess);

  // Non connecté ET pas d'accès admin → redirection login
  if (!isAuthenticated) {
    storage.setRedirectAfterLogin(location.pathname + location.search);
    return <Navigate to="/connexion" replace />;
  }

  // Connecté mais rôle non-admin ET pas encore déverrouillé par mot de passe
  if (user?.role !== 'admin' && !hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  // Accès admin déverrouillé par mot de passe mais rôle pas encore élevé dans le state
  // (peut arriver le temps que le state React se synchronise)
  if (hasAdminAccess && user?.role !== 'admin') {
    // Le mot de passe a été validé — on affiche le contenu admin
    // L'élévation du rôle est gérée dans AuthContext.checkAdminPassword
    return <>{children}</>;
  }

  // Modal de déverrouillage si rôle admin mais pas encore le mot de passe local
  if (!hasAdminAccess) {
    return (
      <AdminLockModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setModalOpen(false)}
      />
    );
  }

  return <>{children}</>;
};
