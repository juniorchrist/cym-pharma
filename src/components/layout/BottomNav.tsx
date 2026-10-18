import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  House,
  LayoutGrid,
  RotateCcw,
  ClipboardList,
  Truck,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBottomNavHidden } from '../../hooks/useBottomNavHidden';
import { storage } from '../../utils/storage';

/* ─── Types ─── */
type NavItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
  to: string;
};

/* ─── 5 Entrées B2B CYM Pharma (Mobile & Tablette) ─── */
const ITEMS: NavItem[] = [
  { key: 'home',      label: 'Accueil',   icon: House,          to: '/accueil' },
  { key: 'catalogue', label: 'Catalogue', icon: LayoutGrid,     to: '/catalogue' },
  { key: 'reorder',  label: 'Racheter',  icon: RotateCcw,      to: '/dashboard?panel=overview&scroll=reappro' },
  { key: 'orders',   label: 'Commandes', icon: ClipboardList,  to: '/dashboard?panel=commandes' },
  { key: 'suivi',    label: 'Suivi',     icon: Truck,          to: '/dashboard?panel=suivis' },
];

/* ─── Calcul de l'index actif ─── */
function getActiveIndex(pathname: string, panel: string, search: string): number {
  const p = pathname.toLowerCase();

  // Accueil
  if (p === '/' || p.startsWith('/accueil')) return 0;
  // Catalogue
  if (
    p.startsWith('/catalogue') ||
    p.startsWith('/categorie') ||
    p.startsWith('/produit')
  )
    return 1;
  // Dashboard routes
  if (p.startsWith('/dashboard')) {
    // Racheter → panel=overview ou scroll=reappro
    if (search.includes('scroll=reappro') || panel === 'overview') return 2;
    // Commandes → panel=commandes ou factures
    if (['commandes', 'factures'].includes(panel)) return 3;
    // Suivi → panel=suivis ou livraisons
    if (['suivis', 'livraisons'].includes(panel)) return 4;
    return -1;
  }
  return -1;
}

/* ══════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ══════════════════════════════════════════ */
export const BottomNav: React.FC = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const hidden = useBottomNavHidden();

  const searchParams = new URLSearchParams(search);
  const panel = searchParams.get('panel') ?? '';

  const items = ITEMS;
  const cols = items.length; // 5 entrées
  const activeIndex = getActiveIndex(pathname, panel, search);

  const handleNavClick = (item: NavItem) => {
    if (item.to.includes('panel=')) {
      const m = item.to.match(/panel=([^&]+)/);
      if (m) storage.setDashPanel(m[1]);
    }
    if (item.key === 'reorder') {
      setTimeout(() => {
        const el = document.getElementById('reappro-section') || document.getElementById('quick-reorder-list');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
    navigate(item.to);
  };

  return (
    <nav
      aria-label="Navigation principale"
      className={`
        fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-40
        mx-auto h-16 max-w-[480px] rounded-3xl
        border border-[#DDE6EA] bg-white/92 backdrop-blur-md
        shadow-[0_8px_24px_rgba(15,35,50,.10),0_1px_2px_rgba(15,35,50,.06)]
        transition-transform duration-[220ms] ease-out lg:hidden select-none
        ${hidden ? 'translate-y-[calc(100%+24px)] pointer-events-none' : 'translate-y-0'}
      `}
      style={{ boxShadow: '0 8px 24px rgba(15,35,50,0.10), 0 1px 2px rgba(15,35,50,0.06)' }}
    >
      <ul
        className="relative h-full items-center p-0 m-0 list-none"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {/* ── Indicateur pilule glissant ── */}
        {activeIndex >= 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-11 rounded-2xl bg-[#E8F1F8]
              transition-all duration-[260ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
            style={{
              width: `calc(${100 / cols}% - 8px)`,
              left: `calc(${activeIndex} * ${100 / cols}% + 4px)`,
            }}
          />
        )}

        {items.map((item, i) => {
          const Icon = item.icon;
          const active = i === activeIndex;
          const cls = [
            'relative flex h-full min-h-[48px] w-full flex-col items-center justify-center gap-1',
            'text-[11px] leading-none',
            'transition-transform active:scale-[0.96] duration-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#155E95] focus-visible:ring-offset-2 rounded-2xl',
            active ? 'font-bold text-[#155E95]' : 'font-semibold text-[#64748B]',
          ].join(' ');

          return (
            <li key={item.key} className="flex h-full items-center justify-center">
              <button
                type="button"
                onClick={() => handleNavClick(item)}
                className={cls}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span className="tracking-tight">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
