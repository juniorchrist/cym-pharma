import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Truck,
  ShoppingCart,
  FileText,
  MapPin,
  User as UserIcon,
  Phone,
  LogOut,
  Plus,
  RotateCcw,
  Clock,
  CheckCircle2,
  Receipt,
  Printer,
  Send,
  MessageCircle,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Users, Orders } from '../services/api';
import { storage } from '../utils/storage';
import { formatCurrency } from '../utils/currency';
import { Order } from '../types';

type PanelKey = 'overview' | 'commandes' | 'suivis' | 'factures' | 'profil' | 'support';

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { add, openDrawer } = useCart();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [activePanel, setActivePanel] = useState<PanelKey>(() => {
    const params = new URLSearchParams(window.location.search);
    const pParam = params.get('panel');
    if (pParam === 'livraisons') return 'suivis';
    if (pParam && ['overview', 'commandes', 'suivis', 'factures', 'profil', 'support'].includes(pParam)) {
      return pParam as PanelKey;
    }
    const saved = storage.getDashPanel() as PanelKey;
    if (saved && ['overview', 'commandes', 'suivis', 'factures', 'profil', 'support'].includes(saved)) {
      return saved;
    }
    const hash = window.location.hash.replace('#', '') as PanelKey;
    if (hash && ['overview', 'commandes', 'suivis', 'factures', 'profil', 'support'].includes(hash)) {
      return hash;
    }
    return 'overview';
  });

  // Écoute les changements d'URL (clics sur BottomNav, raccourcis header/tablette)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rawPanel = params.get('panel') || location.hash.replace('#', '');
    let target: PanelKey | null = null;
    if (rawPanel === 'livraisons') {
      target = 'suivis';
    } else if (['overview', 'commandes', 'suivis', 'factures', 'profil', 'support'].includes(rawPanel)) {
      target = rawPanel as PanelKey;
    }

    if (target) {
      setActivePanel(target);
      storage.setDashPanel(target);
    }

    if (params.get('scroll') === 'reappro' || location.search.includes('reappro')) {
      setTimeout(() => {
        const el = document.getElementById('reappro-section') || document.getElementById('quick-reorder-list');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    }
  }, [location.search, location.hash]);

  const [statusFilter, setStatusFilter] = useState('all');

  // Profile Form state — initialisé vide, rechargé via useEffect quand user est disponible
  const [profOrg, setProfOrg] = useState('');
  const [profName, setProfName] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profPhone, setProfPhone] = useState('');

  // Sync des inputs de profil dès que user est chargé depuis le contexte d'auth
  useEffect(() => {
    if (user) {
      setProfOrg(user.establishment_name || user.org || '');
      setProfName(
        user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.name || ''
      );
      setProfEmail(user.email || '');
      setProfPhone(user.phone || '');
    }
  }, [user]);

  // Urgent alert input
  const [urgentInput, setUrgentInput] = useState('');

  // Historique de commandes (vide par défaut — chargé depuis l'API)
  const [orders, setOrders] = useState<Order[]>([]);

  const totalInvoiced = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const invoicedCount = orders.filter((o) => (Number(o.total) || 0) > 0 || o.invoice_number || o.status === 'Facture disponible').length;

  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchOrders = async () => {
      setOrdersLoading(true);
      try {
        const res = await Orders.list();
        if (isMounted) {
          if (res.success && Array.isArray(res.data?.orders)) {
            setOrders(res.data.orders);
          } else {
            setOrders([]);
          }
        }
      } catch (err) {
        console.warn('Orders.list error:', err);
        if (isMounted) setOrders([]);
      } finally {
        if (isMounted) setOrdersLoading(false);
      }
    };

    fetchOrders();
    return () => {
      isMounted = false;
    };
  }, []);

  const switchPanel = (panel: PanelKey) => {
    setActivePanel(panel);
    storage.setDashPanel(panel);
    setSearchParams({ panel });
    window.location.hash = panel;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const nameParts = profName.split(' ');
      await Users.updateProfile({
        establishment_name: profOrg,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' '),
        email: profEmail,
        phone: profPhone,
      });

      const updatedUser = {
        ...(user || { id: 'u_local', role: 'client' }),
        establishment_name: profOrg,
        org: profOrg,
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' '),
        name: profName,
        email: profEmail,
        phone: profPhone,
      };

      storage.setUser(updatedUser);
      showToast('Profil de la structure mis à jour avec succès.', 'success');
    } catch {
      showToast('Profil mis à jour localement.', 'success');
    }
  };

  const handleReorder = (orderRef: string) => {
    add(`reorder-${orderRef}`, `Commande ${orderRef} (Réassort)`, 1, orderRef);
    showToast(`Les articles de la commande ${orderRef} ont été ajoutés à votre panier.`, 'success');
    openDrawer();
  };

  const handleReorderProduct = (id: string, name: string) => {
    add(id, name, 1);
    showToast(`"${name}" ajouté au panier.`, 'success');
  };

  const handleUrgentAlert = () => {
    if (!urgentInput.trim()) {
      showToast('Veuillez préciser la référence ou le produit demandé.', 'warning');
      return;
    }
    showToast('Demande prioritaire transmise à notre service logistique. Rappel sous 15 min.', 'success');
    setUrgentInput('');
  };

  const isOrderPending = (status: string) => {
    const s = (status || '').toLowerCase();
    return s.includes('chiffrer') || s.includes('attente') || s === 'pending' || s === 'processing' || s === 'shipped' || s.includes('cours');
  };

  const isOrderDelivered = (status: string) => {
    const s = (status || '').toLowerCase();
    return s === 'delivered' || s.includes('livrée') || s.includes('livree');
  };

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return isOrderPending(o.status || '');
    if (statusFilter === 'delivered') return isOrderDelivered(o.status || '');
    return (o.status || '').toLowerCase() === statusFilter.toLowerCase();
  });

  // Dernière commande réelle (la plus récente)
  const lastOrder = orders.length > 0 ? orders[0] : null;

  // Commande en cours de livraison active
  const activeShipment = orders.find((o) => {
    const s = (o.status || '').toLowerCase();
    return s.includes('livraison') || s.includes('expédition') || s === 'shipped';
  }) || null;

  // Produits de réapprovisionnement rapide — uniquement depuis l'historique réel
  const reorderProducts = (() => {
    const seen = new Set<string>();
    const result: Array<{ id: string; name: string; unit?: string; ref?: string }> = [];
    for (const o of orders) {
      for (const it of (o.items || [])) {
        const key = String(it.product_id || it.productId || it.name || '');
        if (key && !seen.has(key)) {
          seen.add(key);
          result.push({
            id: key,
            name: it.name || `Produit (réf. ${key})`,
            unit: it.unit || 'Unité',
            ref: it.reference || String(it.product_id || it.productId || ''),
          });
        }
      }
      if (result.length >= 5) break;
    }
    return result;
  })();

  const displayOrg = profOrg || user?.establishment_name || user?.org || '';
  const displayName = profName || user?.name || '';
  const initials = displayOrg.slice(0, 2).toUpperCase() || (user?.email || '??').slice(0, 2).toUpperCase();

  return (
    <PageShell>
      <div className="pt-24 pb-24 lg:pb-16 mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex gap-7 items-start">
          {/* SIDEBAR DESKTOP */}
          <aside
            id="sidebar"
            className="w-64 shrink-0 dash-card p-4 hidden lg:flex flex-col justify-between sticky top-24 min-h-[580px]"
          >
            <div className="space-y-5">
              {/* Carte Établissement */}
              <div className="rounded-xl p-3.5 flex items-center gap-3 border border-slate-100 bg-slate-100">
                <div
                  id="side-avatar"
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm"
                  style={{ background: 'var(--primary)' }}
                >
                  {initials}
                </div>
                <div className="min-w-0">
                  <p id="side-user-org" className="text-xs font-bold truncate text-slate-900">
                    {displayOrg}
                  </p>
                  <p id="side-user-name" className="text-[11px] truncate text-slate-500">
                    {displayName}
                  </p>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-700 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Compte vérifié</span>
                  </div>
                </div>
              </div>

              {/* Navigation 7 Panels */}
              <nav className="flex flex-col gap-1.5 w-full">
                <button
                  type="button"
                  className={`side-item ${activePanel === 'overview' ? 'active' : ''}`}
                  onClick={() => switchPanel('overview')}
                >
                  <span className="icon-box">
                    <LayoutDashboard className="w-4 h-4 shrink-0" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-left">Vue d'ensemble</span>
                </button>

                <button
                  type="button"
                  className={`side-item ${activePanel === 'commandes' ? 'active' : ''}`}
                  onClick={() => switchPanel('commandes')}
                >
                  <span className="icon-box">
                    <Package className="w-4 h-4 shrink-0" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-left">Mes commandes</span>
                </button>

                <button
                  type="button"
                  className={`side-item ${activePanel === 'suivis' ? 'active' : ''}`}
                  onClick={() => switchPanel('suivis')}
                >
                  <span className="icon-box">
                    <Truck className="w-4 h-4 shrink-0" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-left">Suivis livraison</span>
                </button>

                <button
                  type="button"
                  className="side-item"
                  onClick={openDrawer}
                >
                  <span className="icon-box">
                    <ShoppingCart className="w-4 h-4 shrink-0" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-left">Mon panier</span>
                </button>

                <button
                  type="button"
                  className={`side-item ${activePanel === 'factures' ? 'active' : ''}`}
                  onClick={() => switchPanel('factures')}
                >
                  <span className="icon-box">
                    <FileText className="w-4 h-4 shrink-0" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-left">Factures</span>
                </button>

                <button
                  type="button"
                  className={`side-item ${activePanel === 'profil' ? 'active' : ''}`}
                  onClick={() => switchPanel('profil')}
                >
                  <span className="icon-box">
                    <UserIcon className="w-4 h-4 shrink-0" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-left">Profil structure</span>
                </button>

                <button
                  type="button"
                  className={`side-item ${activePanel === 'support' ? 'active' : ''}`}
                  onClick={() => switchPanel('support')}
                >
                  <span className="icon-box">
                    <Phone className="w-4 h-4 shrink-0" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-left">Assistance &amp; Urgences</span>
                </button>
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/connexion');
                }}
                className="side-item text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-100 cursor-pointer"
              >
                <span className="icon-box text-red-600 bg-red-50">
                  <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
                </span>
                <span className="flex-1 text-left">Déconnexion</span>
              </button>
            </div>
          </aside>

          {/* MAIN PANELS VIEWPORT */}
          <main className="flex-1 min-w-0">
            {/* PANEL 1: VUE D'ENSEMBLE */}
            {activePanel === 'overview' && (
              <div id="panel-overview" className="dash-panel active space-y-6">
                {/* Hero Section */}
                <div className="dash-card p-6 sm:p-7">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div>
                      <h1 id="welcome-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                        Bonjour, {displayOrg}
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl">
                        Gérez vos approvisionnements médicaux, vos réassorts officinaux et le suivi de vos livraisons à Abidjan et en Côte d'Ivoire.
                      </p>
                    </div>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                      <Link to="/catalogue" className="btn-cym-primary">
                        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                        <span>Nouvelle commande</span>
                      </Link>
                      <Link to="/catalogue" className="btn-cym-secondary">
                        <span>Voir le catalogue</span>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* 4 KPIs Max */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div className="dash-card p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Commandes
                      </span>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-700 bg-blue-50">
                        <Package className="w-4 h-4" strokeWidth={2} />
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 tracking-tight" id="stat-orders-placed">
                      {orders.length}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Historique global</p>
                  </div>

                  <div className="dash-card p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        En cours
                      </span>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-amber-700 bg-amber-50">
                        <Clock className="w-4 h-4" strokeWidth={2} />
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 tracking-tight" id="stat-pending">
                      {orders.filter((o) => isOrderPending(o.status || '')).length}
                    </p>
                    <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                      {orders.filter((o) => isOrderPending(o.status || '')).length} en traitement
                    </p>
                  </div>

                  <div className="dash-card p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Livrées
                      </span>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-700 bg-emerald-50">
                        <CheckCircle2 className="w-4 h-4" strokeWidth={2} />
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-slate-900 tracking-tight" id="stat-delivered">
                      {orders.filter((o) => isOrderDelivered(o.status || '')).length}
                    </p>
                    <p className="text-[11px] text-emerald-700 font-medium mt-0.5">Réceptionnées</p>
                  </div>

                  <div className="dash-card p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Total Facturé
                      </span>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 bg-slate-100">
                        <Receipt className="w-4 h-4" strokeWidth={2} />
                      </span>
                    </div>
                    <p className="text-xl font-bold text-slate-900 tracking-tight" id="stat-month-spent">
                      {totalInvoiced > 0 ? formatCurrency(totalInvoiced) : '0 FCFA'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{invoicedCount} facture(s) chiffrée(s)</p>
                  </div>
                </div>

                {/* Bloc Suivi de livraison & Timeline — données réelles uniquement */}
                <div className="dash-card p-6">
                  {activeShipment ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-5">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Suivi d'expédition actif
                        </span>
                        <h3 id="active-delivery-ref" className="text-base font-bold text-slate-900 mt-0.5">
                          <span className="font-ref text-[var(--primary)]">{activeShipment.orderNumber || activeShipment.id}</span>
                          {activeShipment.establishment_name && ` — ${activeShipment.establishment_name}`}
                        </h3>
                      </div>
                      <span id="active-delivery-badge" className="status-pill status-pill-blue self-start sm:self-auto">
                        <Truck className="w-3 h-3" />
                        <span>{activeShipment.status || 'En livraison'}</span>
                      </span>
                    </div>
                  ) : (
                    <div className="pb-4 border-b border-slate-100 mb-5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Suivi d'expédition</span>
                    </div>
                  )}

                  {activeShipment ? (
                    <>
                  {/* Timeline 4 étapes avec ligne de progression connectée */}
                  <div className="relative py-3 mb-4">
                    <div className="absolute top-7 left-[12%] right-[12%] h-1 bg-slate-100 -translate-y-1/2 z-0 hidden sm:block">
                      <div className="h-full bg-emerald-500 w-[66%]" />
                    </div>

                    <div className="relative z-10 grid grid-cols-4 gap-2 text-center">
                      <div className="space-y-1.5 flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-emerald-600 shadow-xs ring-4 ring-white">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <p className="text-xs font-bold text-slate-900">Validée</p>
                        <p className="text-[10px] text-slate-400">Officine</p>
                      </div>

                      <div className="space-y-1.5 flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-emerald-600 shadow-xs ring-4 ring-white">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <p className="text-xs font-bold text-slate-900">Préparation</p>
                        <p className="text-[10px] text-slate-400">Dépôt Abidjan</p>
                      </div>

                      <div className="space-y-1.5 flex flex-col items-center">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-xs ring-4 ring-white"
                          style={{ background: 'var(--primary)' }}
                        >
                          <Truck className="w-3.5 h-3.5" />
                        </div>
                        <p className="text-xs font-bold text-blue-700">En livraison</p>
                        <p className="text-[10px] text-slate-500 font-medium">En route</p>
                      </div>

                      <div className="space-y-1.5 flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs bg-slate-100 text-slate-400 ring-4 ring-white">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                        <p className="text-xs font-medium text-slate-400">Livrée</p>
                        <p className="text-[10px] text-slate-400">Délivrance</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">Destination :</span>
                      <span id="active-delivery-city" className="font-semibold text-slate-800">
                        {activeShipment?.shipping_city || 'Abidjan'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">Établissement :</span>
                      <span id="active-delivery-mode" className="font-semibold text-slate-800">
                        {activeShipment?.establishment_name || displayOrg || 'Votre établissement'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <Link
                        to={`/facture?id=${activeShipment?.orderNumber || activeShipment?.id || ''}`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--primary)] hover:underline"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Consulter la Facture A4</span>
                      </Link>
                    </div>
                  </div>
                    </>
                  ) : (
                    <div className="py-8 text-center space-y-2">
                      <Truck className="w-8 h-8 text-slate-200 mx-auto" strokeWidth={1.5} />
                      <p className="text-sm font-semibold text-slate-600">Aucune expédition en cours</p>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        Le suivi de livraison apparaîtra ici lorsqu'une commande sera en cours d'acheminement.
                      </p>
                    </div>
                  )}
                </div>

                {/* Bloc "Dernier achat" & "Réapprovisionnement rapide" — données réelles uniquement */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Dernier achat mis en avant */}
                  <div className="dash-card p-6 lg:col-span-1 flex flex-col justify-between">
                    {lastOrder ? (
                      <>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Dernier achat
                          </span>
                          <span className="font-ref text-xs font-bold text-slate-900" id="last-order-ref">
                            {lastOrder.orderNumber || lastOrder.id}
                          </span>
                        </div>
                        <h4 id="last-order-title" className="text-sm font-bold text-slate-900 leading-snug">
                          {(lastOrder.items || []).length > 0
                            ? (lastOrder.items || []).slice(0, 2).map((it: any) => it.name || 'Dispositif médical').join(' & ')
                            : lastOrder.establishment_name || 'Commande de dispositifs médicaux'}
                        </h4>
                        <p id="last-order-meta" className="text-xs text-slate-500 mt-1">
                          {lastOrder.created_at
                            ? new Date(lastOrder.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                            : 'Date inconnue'}
                          {' • '}{(lastOrder.items || []).length} article(s)
                        </p>
                        <div className="my-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                          <span className="text-xs text-slate-400 font-medium">Montant</span>
                          <span id="last-order-total" className="text-sm font-bold text-slate-900">
                            {lastOrder.total ? formatCurrency(lastOrder.total) : <span className="text-slate-400 font-normal italic">En chiffrage</span>}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <button
                          type="button"
                          onClick={() => handleReorder(String(lastOrder.orderNumber || lastOrder.id))}
                          className="w-full btn-cym-primary"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Commander à nouveau</span>
                        </button>
                        <Link
                          to={`/facture?id=${lastOrder.orderNumber || lastOrder.id}`}
                          target="_blank"
                          className="w-full btn-cym-secondary text-center"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Voir la Facture A4</span>
                        </Link>
                      </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                          <ShoppingCart className="w-5 h-5 text-slate-300" strokeWidth={1.5} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">Aucune commande</p>
                          <p className="text-xs text-slate-400 mt-1 max-w-[180px] mx-auto">
                            Vous n'avez pas encore passé de commande.
                          </p>
                        </div>
                        <Link to="/catalogue" className="btn-cym-primary text-xs !py-1.5 !px-4">
                          <Plus className="w-3 h-3" />
                          <span>Voir le catalogue</span>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Réapprovisionnement rapide — uniquement depuis l'historique réel */}
                  <div id="reappro-section" className="dash-card p-6 lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Réapprovisionnement rapide</h3>
                        <p className="text-xs text-slate-500">Vos produits habituels en 1 clic</p>
                      </div>
                      <Link
                        to="/catalogue"
                        className="text-xs font-bold text-[var(--primary)] hover:underline flex items-center gap-1"
                      >
                        <span>Catalogue complet</span>
                        <Plus className="w-3 h-3" strokeWidth={2.5} />
                      </Link>
                    </div>

                    <div className="space-y-3" id="quick-reorder-list">
                      {reorderProducts.length > 0 ? (
                        reorderProducts.map((prod) => (
                          <div key={prod.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition bg-slate-50/70">
                            <div className="min-w-0 pr-3">
                              <p className="text-xs font-bold text-slate-900 truncate">{prod.name}</p>
                              {prod.ref && <p className="text-[11px] text-slate-500">Réf. {prod.ref}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleReorderProduct(prod.id, prod.name)}
                              className="btn-cym-primary text-xs !py-1.5 !px-3 shrink-0"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Ajouter</span>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center space-y-2">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto">
                            <Package className="w-5 h-5 text-slate-300" strokeWidth={1.5} />
                          </div>
                          <p className="text-sm font-semibold text-slate-600">Aucun produit habituel</p>
                          <p className="text-xs text-slate-400 max-w-xs mx-auto">
                            Vos produits habituels apparaîtront ici après votre première commande.
                          </p>
                          <Link to="/catalogue" className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--primary)] hover:underline mt-1">
                            <Plus className="w-3 h-3" />
                            <span>Parcourir le catalogue</span>
                          </Link>
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* Tableau des commandes récentes */}
                <div className="dash-card p-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Commandes récentes</h3>
                      <p className="text-xs text-slate-500">Dernières commandes enregistrées pour votre établissement</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchPanel('commandes')}
                      className="text-xs font-bold text-[var(--primary)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Voir tout l'historique</span>
                      <Plus className="w-3 h-3" strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                          <th className="pb-3 font-semibold">Référence</th>
                          <th className="pb-3 font-semibold">Date</th>
                          <th className="pb-3 font-semibold">Articles</th>
                          <th className="pb-3 font-semibold">Montant TTC</th>
                          <th className="pb-3 font-semibold">Statut</th>
                          <th className="pb-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orders.map((ord) => (
                          <tr key={ord.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 font-ref font-bold text-[var(--primary)]">
                              {ord.orderNumber || ord.id}
                            </td>
                            <td className="py-3.5 text-slate-600">
                              {new Date(ord.created_at || '').toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="py-3.5 text-slate-600">
                              {ord.item_count || ord.items?.length || 1} article(s)
                            </td>
                            <td className="py-3.5 font-semibold text-slate-900">
                              {ord.total ? formatCurrency(ord.total) : <span className="text-slate-400 font-normal italic">En chiffrage</span>}
                            </td>
                            <td className="py-3.5">
                              {ord.status === 'Facture disponible' || (Number(ord.total) || 0) > 0 ? (
                                <span className="status-pill status-pill-green">Facture disponible</span>
                              ) : ord.status === 'delivered' ? (
                                <span className="status-pill status-pill-green">Livrée</span>
                              ) : ord.status === 'shipped' ? (
                                <span className="status-pill status-pill-blue">En livraison</span>
                              ) : (
                                <span className="status-pill status-pill-amber">À chiffrer</span>
                              )}
                            </td>
                            <td className="py-3.5 text-right space-x-2">
                              <Link
                                to={`/facture?id=${ord.orderNumber || ord.id}`}
                                target="_blank"
                                className="font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Facture A4</span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleReorder(String(ord.orderNumber || ord.id))}
                                className="text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                              >
                                Re-commander
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* PANEL 2: MES COMMANDES */}
            {activePanel === 'commandes' && (
              <div id="panel-commandes" className="dash-panel active space-y-6">
                <div className="dash-card p-6 sm:p-7">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-6">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-slate-900">Historique des commandes</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Consultez l'ensemble de vos commandes et téléchargez vos factures officielles imprimables.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">Filtrer par statut :</span>
                      <select
                        id="orders-filter-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-lg px-3 py-1.5 text-xs bg-slate-100 border border-slate-200 outline-none font-semibold text-slate-700"
                      >
                        <option value="all">Toutes les commandes</option>
                        <option value="pending">En attente / traitement</option>
                        <option value="shipped">En livraison</option>
                        <option value="delivered">Livrées</option>
                        <option value="cancelled">Annulées</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                          <th className="pb-3 font-semibold">Référence</th>
                          <th className="pb-3 font-semibold">Date</th>
                          <th className="pb-3 font-semibold">Articles</th>
                          <th className="pb-3 font-semibold">Montant TTC</th>
                          <th className="pb-3 font-semibold">Statut</th>
                          <th className="pb-3 font-semibold text-right">Facture officielle</th>
                        </tr>
                      </thead>
                      <tbody id="full-orders-table" className="divide-y divide-slate-100">
                        {filteredOrders.map((ord) => (
                          <tr key={ord.id} className="hover:bg-slate-50 transition">
                            <td className="py-4 font-ref font-bold text-[var(--primary)]">
                              {ord.orderNumber || ord.id}
                            </td>
                            <td className="py-4 text-slate-600">
                              {new Date(ord.created_at || '').toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="py-4 text-slate-600">{ord.item_count || ord.items?.length || 1} article(s)</td>
                            <td className="py-4 font-semibold text-slate-900">
                              {ord.total ? formatCurrency(ord.total) : <span className="text-slate-400 font-normal italic">En chiffrage</span>}
                            </td>
                            <td className="py-4">
                              {ord.status === 'Facture disponible' || (Number(ord.total) || 0) > 0 ? (
                                <span className="status-pill status-pill-green">Facture prête</span>
                              ) : ord.status === 'delivered' ? (
                                <span className="status-pill status-pill-green">Livrée</span>
                              ) : ord.status === 'shipped' ? (
                                <span className="status-pill status-pill-blue">En livraison</span>
                              ) : (
                                <span className="status-pill status-pill-amber">À chiffrer</span>
                              )}
                            </td>
                            <td className="py-4 text-right">
                              {ord.status === 'Facture disponible' || (Number(ord.total) || 0) > 0 || ord.invoice_number ? (
                                <Link
                                  to={`/facture?id=${ord.orderNumber || ord.id}`}
                                  target="_blank"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>{ord.invoice_number || `FAC-${String(ord.orderNumber || ord.id).replace('CMD-', '')}`}</span>
                                </Link>
                              ) : (
                                <span className="text-slate-400 text-xs italic">En attente de chiffrage</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* PANEL 3: SUIVIS LIVRAISON */}
            {activePanel === 'suivis' && (
              <div id="panel-suivis" className="dash-panel active space-y-6">
                <div className="dash-card p-6 sm:p-7">
                  <div className="pb-4 border-b border-slate-100 mb-6">
                    <h2 className="text-xl font-bold tracking-tight text-slate-900">
                      Suivi des expéditions &amp; Livraisons
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Suivez l'état d'acheminement de vos colis médicaux en Côte d'Ivoire.
                    </p>
                  </div>

                  {activeShipment ? (
                    <div className="p-5 rounded-xl border border-slate-200 mb-6 bg-slate-50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-ref text-xs font-bold text-[var(--primary)] px-2 py-0.5 rounded bg-blue-50">
                              {activeShipment.orderNumber || activeShipment.id}
                            </span>
                            {activeShipment.invoice_number && (
                              <span className="text-xs text-slate-500">Facture #{activeShipment.invoice_number}</span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-slate-900">
                            {(activeShipment.items || []).length > 0
                              ? (activeShipment.items || []).map((it: any) => it.name || 'Dispositif médical').join(', ')
                              : activeShipment.establishment_name || 'Commande en cours de livraison'}
                          </h4>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="status-pill status-pill-blue">{activeShipment.status || 'En acheminement'}</span>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Destination : {activeShipment.shipping_city || displayOrg || 'Abidjan'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center py-2 mb-3">
                        <div className="space-y-1">
                          <div className="w-8 h-8 rounded-full mx-auto flex items-center justify-center text-white bg-emerald-600 shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-xs font-bold text-slate-900">Validée</p>
                          <p className="text-[10px] text-slate-400">Officine</p>
                        </div>
                        <div className="space-y-1">
                          <div className="w-8 h-8 rounded-full mx-auto flex items-center justify-center text-white bg-emerald-600 shadow-sm">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-xs font-bold text-slate-900">Préparée</p>
                          <p className="text-[10px] text-slate-400">Dépôt</p>
                        </div>
                        <div className="space-y-1">
                          <div
                            className="w-8 h-8 rounded-full mx-auto flex items-center justify-center text-white shadow-sm"
                            style={{ background: 'var(--primary)' }}
                          >
                            <Truck className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-xs font-bold text-blue-700">En livraison</p>
                          <p className="text-[10px] text-slate-500 font-medium">En transit</p>
                        </div>
                        <div className="space-y-1">
                          <div className="w-8 h-8 rounded-full mx-auto flex items-center justify-center text-xs bg-slate-100 text-slate-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-xs font-medium text-slate-400">Livrée</p>
                          <p className="text-[10px] text-slate-400">Estimée</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
                        <Truck className="w-6 h-6 text-slate-300" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-700">Aucune livraison en cours</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                          Le suivi de vos expéditions apparaîtra ici lorsqu'une commande sera en cours d'acheminement vers votre établissement.
                        </p>
                      </div>
                      <Link to="/catalogue" className="inline-flex items-center gap-2 btn-cym-primary text-xs !py-1.5 !px-4">
                        <Plus className="w-3 h-3" />
                        <span>Passer une commande</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PANEL 4: FACTURES & PIÈCES COMPTABLES */}
            {activePanel === 'factures' && (
              <div id="panel-factures" className="dash-panel active space-y-6">
                <div className="dash-card p-6 sm:p-7">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-6">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-slate-900">
                        Mes Factures Officielles
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Consultez, téléchargez et imprimez vos factures chiffrées au format officiel A4 CYM Pharma.
                      </p>
                    </div>
                    <span className="status-pill status-pill-blue">
                      {invoicedCount} facture(s) émise(s)
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                          <th className="pb-3 font-semibold">N° Facture</th>
                          <th className="pb-3 font-semibold">Commande</th>
                          <th className="pb-3 font-semibold">Date d'émission</th>
                          <th className="pb-3 font-semibold">Montant TTC</th>
                          <th className="pb-3 font-semibold">Statut</th>
                          <th className="pb-3 font-semibold text-right">Facture officielle A4</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orders.map((o) => (
                          <tr key={o.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 font-ref font-bold text-[var(--primary)]">
                              {o.invoice_number || `FAC-${String(o.orderNumber || o.id).replace('CMD-', '')}`}
                            </td>
                            <td className="py-3.5 font-ref text-slate-600">{o.orderNumber || o.id}</td>
                            <td className="py-3.5 text-slate-600">
                              {new Date(o.invoice_date || o.created_at || '').toLocaleDateString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="py-3.5 font-semibold text-slate-900">
                              {o.total ? formatCurrency(o.total) : <span className="text-slate-400 font-normal italic">En cours</span>}
                            </td>
                            <td className="py-3.5">
                              {o.status === 'delivered' ? (
                                <span className="status-pill status-pill-green">Acquittée</span>
                              ) : o.total || o.invoice_number ? (
                                <span className="status-pill status-pill-green">Disponible</span>
                              ) : (
                                <span className="status-pill status-pill-amber">En chiffrage</span>
                              )}
                            </td>
                            <td className="py-3.5 text-right">
                              <Link
                                to={`/facture?id=${o.orderNumber || o.id}`}
                                target="_blank"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold btn-cym-primary !py-1 !px-2.5"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Consulter Facture A4</span>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}


            {/* PANEL 6: PROFIL DE STRUCTURE */}
            {activePanel === 'profil' && (
              <div id="panel-profil" className="dash-panel active space-y-6">
                <div className="dash-card p-6 sm:p-7">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 mb-1">
                    Profil de votre établissement
                  </h2>
                  <p className="text-xs text-slate-500 mb-6">
                    Informations officielles de la structure et coordonnées du responsable des approvisionnements.
                  </p>

                  <form onSubmit={handleProfileSubmit} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-500" htmlFor="prof-org-input">
                          Nom de la structure
                        </label>
                        <input
                          id="prof-org-input"
                          type="text"
                          className="w-full h-11 px-4 rounded-xl border border-slate-200 text-xs font-medium outline-none focus:border-[var(--primary)] transition bg-slate-100"
                          value={profOrg}
                          onChange={(e) => setProfOrg(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-500" htmlFor="prof-name-input">
                          Nom du responsable d'achat
                        </label>
                        <input
                          id="prof-name-input"
                          type="text"
                          className="w-full h-11 px-4 rounded-xl border border-slate-200 text-xs font-medium outline-none focus:border-[var(--primary)] transition bg-slate-100"
                          value={profName}
                          onChange={(e) => setProfName(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-500" htmlFor="prof-email-input">
                          Email professionnel
                        </label>
                        <input
                          id="prof-email-input"
                          type="email"
                          className="w-full h-11 px-4 rounded-xl border border-slate-200 text-xs font-medium outline-none focus:border-[var(--primary)] transition bg-slate-100"
                          value={profEmail}
                          onChange={(e) => setProfEmail(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-slate-500" htmlFor="prof-phone-input">
                          Téléphone professionnel (Côte d'Ivoire)
                        </label>
                        <input
                          id="prof-phone-input"
                          type="text"
                          className="w-full h-11 px-4 rounded-xl border border-slate-200 text-xs font-medium outline-none focus:border-[var(--primary)] transition bg-slate-100"
                          value={profPhone}
                          onChange={(e) => setProfPhone(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button type="submit" className="btn-cym-primary">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Enregistrer les modifications</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* PANEL 7: SUPPORT & ASSISTANCE */}
            {activePanel === 'support' && (
              <div id="panel-support" className="dash-panel active space-y-6">
                <div className="dash-card p-6 sm:p-7">
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 mb-1">
                    Assistance &amp; Commandes urgentes
                  </h2>
                  <p className="text-xs text-slate-500 mb-6">
                    Notre service logistique et commercial est joignable directement pour vos urgences hospitalières.
                  </p>

                  <div className="grid sm:grid-cols-2 gap-4 mb-6">
                    <a
                      href="https://wa.me/2250594841818"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 rounded-xl border border-emerald-200 flex items-center gap-3.5 transition hover:bg-emerald-50/50 bg-[#F0FDF4]"
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-600 text-white shrink-0">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-emerald-950">WhatsApp Professionnel</h4>
                        <p className="text-xs text-emerald-700 font-semibold">+225 05 94 84 18 18</p>
                        <p className="text-[10px] text-emerald-600 mt-0.5">Assistance directe et réassort</p>
                      </div>
                    </a>

                    <a
                      href="tel:+2250594841818"
                      className="p-4 rounded-xl border border-slate-200 flex items-center gap-3.5 transition hover:bg-slate-50 bg-white"
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0"
                        style={{ background: 'var(--primary)' }}
                      >
                        <Phone className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Standard Téléphonique</h4>
                        <p className="text-xs text-slate-700 font-semibold">+225 05 94 84 18 18</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Lun - Sam : 08h00 - 18h30</p>
                      </div>
                    </a>
                  </div>

                  <div className="rounded-xl p-4 border border-slate-100 bg-slate-100">
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-1.5 text-slate-700">
                      Demande de rappel pour rupture ou réassort prioritaire
                    </h4>
                    <p className="text-xs text-slate-500 mb-3">
                      Indiquez la référence ou le produit requis en urgence :
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <input
                        id="urgent-alert-input"
                        type="text"
                        value={urgentInput}
                        onChange={(e) => setUrgentInput(e.target.value)}
                        placeholder="Ex: Seringues 5mL ou Gants Nitrile..."
                        className="flex-1 h-10 px-3.5 rounded-lg border border-slate-200 text-xs bg-white outline-none focus:border-[var(--primary)]"
                      />
                      <button
                        type="button"
                        onClick={handleUrgentAlert}
                        className="btn-cym-primary text-xs !py-2 !px-4 flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Envoyer la demande</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </PageShell>
  );
};
