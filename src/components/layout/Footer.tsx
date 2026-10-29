import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, MapPin, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AdminLockModal } from '../admin/AdminLockModal';

export const Footer: React.FC = () => {
  const [logoError, setLogoError] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const { isAdmin, hasAdminAccess } = useAuth();
  const navigate = useNavigate();

  const handleAdminClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isAdmin || hasAdminAccess) {
      navigate('/admin');
    } else {
      setAdminModalOpen(true);
    }
  };

  return (
    <>
      <div className="footer-bar-gradient mt-16" />
      <footer className="relative border-t border-slate-100 bg-white pt-14 pb-8 text-slate-600">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 pb-12">
            {/* Colonne 1 : Brand & Mission */}
            <div className="space-y-4">
              <Link to="/accueil" className="inline-block" aria-label="CYM Pharma">
                {!logoError ? (
                  <img
                    src="/LOGO.png"
                    alt="CYM Pharma"
                    className="h-10 w-auto object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <div className="logo-fallback h-10">CYM Pharma</div>
                )}
              </Link>
              <p className="text-sm text-slate-500 leading-relaxed">
                Au service de votre santé depuis 2023.
                <br />
                Une équipe{' '}
                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>passionnée</span> qui
                place l'humain au cœur de chaque échange.
              </p>
            </div>

            {/* Colonne 2 : Navigation */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
                Navigation
              </h4>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <Link to="/accueil" className="hover:text-[var(--primary)] transition">
                    Accueil
                  </Link>
                </li>
                <li>
                  <Link to="/catalogue" className="hover:text-[var(--primary)] transition">
                    Catalogue
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-[var(--primary)] transition">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link to="/connexion" className="hover:text-[var(--primary)] transition">
                    Espace client
                  </Link>
                </li>
              </ul>
            </div>

            {/* Colonne 3 : Services */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
                Services
              </h4>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <Link to="/catalogue" className="hover:text-[var(--primary)] transition">
                    Vente de consommables
                  </Link>
                </li>
                <li>
                  <Link to="/catalogue" className="hover:text-[var(--primary)] transition">
                    Équipements médicaux
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-[var(--primary)] transition">
                    Conseil &amp; Matériel
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-[var(--primary)] transition">
                    Support &amp; FAQ
                  </Link>
                </li>
              </ul>
            </div>

            {/* Colonne 4 : Contact & Bouton Admin */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
                Contact
              </h4>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-2.5">
                  <Phone
                    className="w-4 h-4 shrink-0 text-emerald-600"
                    strokeWidth={2}
                  />
                  <span>+225 05 94 84 18 18</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <MapPin
                    className="w-4 h-4 shrink-0 text-[var(--primary)]"
                    strokeWidth={2}
                  />
                  <span>Abidjan, Côte d'Ivoire</span>
                </li>
              </ul>
              <div className="pt-2 group inline-block">
                <button
                  type="button"
                  onClick={handleAdminClick}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-500 opacity-60 group-hover:opacity-100 hover:opacity-100 hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all cursor-pointer"
                  title="Accès réservé à l'administration"
                >
                  <Lock className="w-3 h-3" strokeWidth={2} />
                  <span>Admin</span>
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6 text-center text-xs text-slate-500">
            <p>
              © 2026 CYM Pharma. Tous droits réservés. Réalisé par{' '}
              <span className="font-semibold text-slate-700">Junior Diploh</span>.
            </p>
          </div>
        </div>
      </footer>

      {/* Modale d'authentification administrateur */}
      <AdminLockModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
      />
    </>
  );
};
