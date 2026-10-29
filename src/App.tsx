import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';

// Pages
import { Accueil } from './pages/Accueil';
import { Catalogue } from './pages/Catalogue';
import { Categorie } from './pages/Categorie';
import { Produit } from './pages/Produit';
import { Commande } from './pages/Commande';
import { Connexion } from './pages/Connexion';
import { Inscription } from './pages/Inscription';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { BonLivraison } from './pages/BonLivraison';
import { Facture } from './pages/Facture';
import { Contact } from './pages/Contact';

// Route guards
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AdminRoute } from './routes/AdminRoute';
import { PublicOnlyRoute } from './routes/PublicOnlyRoute';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Accueil />} />
              <Route path="/accueil" element={<Accueil />} />
              <Route path="/catalogue" element={<Catalogue />} />
              <Route path="/categorie" element={<Categorie />} />
              <Route path="/categorie/:slug" element={<Categorie />} />
              <Route path="/produit" element={<Produit />} />
              <Route path="/produit/:id" element={<Produit />} />
              <Route
                path="/commande"
                element={
                  <ProtectedRoute>
                    <Commande />
                  </ProtectedRoute>
                }
              />
              <Route path="/facture" element={<Facture />} />
              <Route path="/facture/:id" element={<Facture />} />
              <Route path="/bon-livraison" element={<BonLivraison />} />
              <Route path="/bon-livraison/:id" element={<BonLivraison />} />
              <Route path="/contact" element={<Contact />} />

              {/* Guest only routes (login & register) */}
              <Route
                path="/connexion"
                element={
                  <PublicOnlyRoute>
                    <Connexion />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/inscription"
                element={
                  <PublicOnlyRoute>
                    <Inscription />
                  </PublicOnlyRoute>
                }
              />

              {/* Protected user dashboard */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              {/* Protected admin dashboard */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <Admin />
                  </AdminRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
