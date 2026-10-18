import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { storage } from '../utils/storage';
import { Clock, X } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isPendingApproval, showPendingBanner, dismissPendingBanner } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    storage.setRedirectAfterLogin(location.pathname + location.search);
    return <Navigate to="/connexion" replace />;
  }

  return (
    <>
      {isPendingApproval && showPendingBanner && (
        <div
          role="alert"
          className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs font-semibold text-amber-900 flex items-center justify-between sticky top-0 z-[60]"
        >
          <div className="flex items-center gap-2 max-w-6xl mx-auto w-full">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" strokeWidth={1.8} />
            <span>Compte en attente de validation. Accès complet sous 24h.</span>
          </div>
          <button
            type="button"
            onClick={dismissPendingBanner}
            aria-label="Fermer la notification"
            className="text-amber-700 hover:text-amber-900 p-1"
          >
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      )}
      {children}
    </>
  );
};
