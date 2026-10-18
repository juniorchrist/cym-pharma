import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  LogOut,
  LayoutDashboard,
  Search,
  X,
  FileText,
  MapPin,
  HeadphonesIcon,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useScrolled } from '../../hooks/useScrolled';

/* ─── Utilitaire : initiales de l'utilisateur ─── */
function getInitials(user: { name?: string; establishment_name?: string; org?: string; email?: string } | null): string {
  const src = user?.establishment_name || user?.org || user?.name || user?.email || '?';
  return src
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/* ─── Bottom sheet Compte (mobile) ─── */
interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  user: { name?: string; establishment_name?: string; org?: string; email?: string } | null;
  initials: string;
  onLogout: () => void;
}

const AccountSheet: React.FC<AccountSheetProps> = ({
  open,
  onClose,
  isAuthenticated,
  user,
  initials,
  onLogout,
}) => {
  const navigate = useNavigate();

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  // Fermeture sur Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px] lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu compte"
        className="fixed bottom-0 inset-x-0 z-[61] rounded-t-2xl bg-white shadow-2xl pb-[env(safe-area-inset-bottom,0px)] lg:hidden
          animate-[slideUp_200ms_ease-out]"
      >
        {/* Poignée */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Infos utilisateur */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white text-sm font-bold select-none">
            {isAuthenticated ? initials : <User size={18} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {isAuthenticated
                ? user?.establishment_name || user?.org || user?.name || 'Mon compte'
                : 'Non connecté'}
            </p>
            {isAuthenticated && user?.email && (
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="ml-auto p-2 rounded-full hover:bg-slate-100 transition"
          >
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Menu */}
        <div className="py-2">
          {isAuthenticated ? (
            <>
              <button onClick={() => go('/dashboard?panel=profil')} className="sheet-item">
                <User size={17} className="text-slate-400" />
                <span>Profil</span>
              </button>
              <button onClick={() => go('/dashboard?panel=factures')} className="sheet-item">
                <FileText size={17} className="text-slate-400" />
                <span>Factures</span>
              </button>
              <button onClick={() => go('/dashboard?panel=suivis')} className="sheet-item">
                <MapPin size={17} className="text-slate-400" />
                <span>Adresses &amp; Livraisons</span>
              </button>
              <button onClick={() => go('/dashboard?panel=support')} className="sheet-item">
                <HeadphonesIcon size={17} className="text-slate-400" />
                <span>Support</span>
              </button>
              <div className="mx-4 my-1 border-t border-slate-100" />
              <button onClick={onLogout} className="sheet-item text-red-600">
                <LogOut size={17} className="text-red-400" />
                <span>Déconnexion</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => go('/connexion')} className="sheet-item">
                <User size={17} className="text-slate-400" />
                <span>Se connecter</span>
              </button>
              <button onClick={() => go('/inscription')} className="sheet-item">
                <LayoutDashboard size={17} className="text-slate-400" />
                <span>Créer un compte</span>
              </button>
            </>
          )}
        </div>
        <div className="h-4" />
      </div>
    </>
  );
};

/* ─── Barre de recherche mobile (inline) ─── */
interface MobileSearchBarProps {
  open: boolean;
  onClose: () => void;
}
const MobileSearchBar: React.FC<MobileSearchBarProps> = ({ open, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputRef.current?.value.trim();
    if (q) {
      navigate(`/catalogue?q=${encodeURIComponent(q)}`);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="absolute inset-x-0 top-0 h-full flex items-center px-3 bg-white/95 backdrop-blur-xl rounded-full z-10 lg:hidden">
      <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
        <Search size={16} className="text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="search"
          placeholder="Rechercher un produit…"
          className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none"
        />
      </form>
      <button type="button" onClick={onClose} aria-label="Fermer la recherche" className="p-2">
        <X size={16} className="text-slate-500" />
      </button>
    </div>
  );
};

/* ══════════════════════════════════════════════════════
   NAVBAR PRINCIPALE
   ══════════════════════════════════════════════════════ */
export const Navbar: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const { count, openDrawer } = useCart();
  const scrolled = useScrolled(20);

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const navigate = useNavigate();

  const cartCount = count();
  const initials = getInitials(user);

  const handleLogout = useCallback(() => {
    logout();
    setUserDropdownOpen(false);
    setAccountSheetOpen(false);
    navigate('/connexion');
  }, [logout, navigate]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="px-3 sm:px-6 pt-3">
          <nav
            id="topNavbar"
            className={`relative mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/60 bg-white/80 px-4 py-2.5 shadow-md backdrop-blur-xl transition-shadow duration-200 ${
              scrolled ? 'scrolled shadow-lg' : ''
            }`}
          >
            {/* Barre de recherche mobile inline (recouvre la nav) */}
            <MobileSearchBar
              open={mobileSearchOpen}
              onClose={() => setMobileSearchOpen(false)}
            />

            {/* ── Logo ── */}
            <Link
              to="/accueil"
              className="shrink-0 flex items-center"
              aria-label="CYM Pharma — Accueil"
            >
              {!logoError ? (
                <img
                  src="/LOGO.png"
                  alt="CYM Pharma"
                  className="h-14 w-auto object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span className="logo-fallback">CYM Pharma</span>
              )}
            </Link>

            {/* ── Navigation desktop ── */}
            <div className="hidden lg:flex items-center gap-7">
              <NavLink to="/accueil" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Accueil
              </NavLink>
              <NavLink to="/catalogue" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Catalogue
              </NavLink>
              <NavLink to="/contact" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                Contact
              </NavLink>
            </div>

            {/* ── Actions droite ── */}
            <div className="flex items-center gap-1">

              {/* ── MOBILE & TABLETTE uniquement : Icône Recherche ── */}
              <button
                type="button"
                onClick={() => setMobileSearchOpen(true)}
                aria-label="Rechercher"
                className="nav-icon-btn lg:hidden"
              >
                <Search className="w-[17px] h-[17px]" strokeWidth={1.75} />
              </button>

              {/* ── Panier (mobile + desktop) ── */}
              <button
                type="button"
                onClick={openDrawer}
                id="nav-cart-btn"
                aria-label={`Panier (${cartCount} article${cartCount > 1 ? 's' : ''})`}
                className="nav-icon-btn relative"
              >
                <ShoppingCart className="w-[17px] h-[17px]" strokeWidth={1.75} />
                {cartCount > 0 && (
                  <span
                    data-cart-badge
                    className="absolute -top-1 -right-1 flex h-[1rem] w-[1rem] items-center justify-center rounded-full bg-[var(--primary)] text-[9px] font-bold text-white leading-none"
                  >
                    {cartCount}
                  </span>
                )}
              </button>

              {/* ── MOBILE & TABLETTE uniquement : Avatar / Compte ── */}
              <button
                type="button"
                id="mob-account-btn"
                onClick={() => setAccountSheetOpen(true)}
                aria-label="Mon compte"
                className="lg:hidden nav-icon-btn"
              >
                {isAuthenticated ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-white text-[10px] font-bold select-none">
                    {initials}
                  </span>
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--primary)] text-[var(--primary)] text-[10px] font-bold">
                    ?
                  </span>
                )}
              </button>

              {/* ── DESKTOP uniquement : dropdown Compte ── */}
              <div className="relative hidden lg:block">
                <button
                  type="button"
                  id="user-menu-btn"
                  onClick={() => setUserDropdownOpen((prev) => !prev)}
                  aria-label="Mon compte"
                  className="nav-icon-btn"
                >
                  {isAuthenticated ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-white text-[10px] font-bold select-none">
                      {initials}
                    </span>
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500 text-[10px]">
                      ?
                    </span>
                  )}
                </button>

                {userDropdownOpen && (
                  <div
                    id="user-dropdown"
                    className="absolute right-0 top-[2.75rem] w-56 origin-top-right rounded-xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(15,23,42,.10)] p-1.5 z-50"
                  >
                    <div className="px-3.5 py-2.5 border-b border-slate-100">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                        {isAuthenticated
                          ? user?.establishment_name || user?.org || user?.name || 'Connecté'
                          : 'Non connecté'}
                      </p>
                      {isAuthenticated && user?.email && (
                        <p className="text-xs text-slate-600 truncate mt-0.5">{user.email}</p>
                      )}
                    </div>

                    {isAuthenticated ? (
                      <>
                        <Link
                          to="/dashboard?panel=profil"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                        >
                          <User className="w-4 h-4 text-slate-400" />
                          <span>Profil</span>
                        </Link>
                        <Link
                          to="/dashboard?panel=factures"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                        >
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span>Factures</span>
                        </Link>
                        <Link
                          to="/dashboard?panel=livraisons"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                        >
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <span>Adresses</span>
                        </Link>
                        <Link
                          to="/dashboard?panel=support"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                        >
                          <HeadphonesIcon className="w-4 h-4 text-slate-400" />
                          <span>Support</span>
                        </Link>
                        <div className="mx-1 my-1 border-t border-slate-100" />
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex w-full items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition text-left cursor-pointer"
                        >
                          <LogOut className="w-4 h-4 text-red-500" />
                          <span>Déconnexion</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          to="/connexion"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                        >
                          Se connecter
                        </Link>
                        <Link
                          to="/inscription"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
                        >
                          Créer un compte
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── DESKTOP uniquement : CTA Se connecter (non connecté) ── */}
              {!isAuthenticated && (
                <Link
                  id="nav-cta-login"
                  to="/connexion"
                  className="hidden lg:inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] text-white text-[.8rem] font-semibold hover:bg-[var(--primary-dark)] transition ml-1 shadow-sm"
                  style={{ padding: '.45rem 1.15rem' }}
                >
                  Se connecter
                </Link>
              )}

            </div>
          </nav>
        </div>
      </header>

      {/* ── Bottom sheet compte (mobile) ── */}
      <AccountSheet
        open={accountSheetOpen}
        onClose={() => setAccountSheetOpen(false)}
        isAuthenticated={isAuthenticated}
        user={user}
        initials={initials}
        onLogout={handleLogout}
      />
    </>
  );
};
