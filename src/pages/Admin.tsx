import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Package,
  FileText,
  Users,
  ShoppingBag,
  Home,
  LogOut,
  Search,
  Plus,
  Coins,
  ShoppingCart,
  AlertTriangle,
  Pencil,
  Trash2,
  X,
  Printer,
  ExternalLink,
  Send,
  Eye,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Menu,
  Calculator,
  Save,
  CheckCheck,
  Shield,
  Lock,
  Layers,
  ArrowUpDown,
  RefreshCw,
  Clock,
  MessageCircle,
  Boxes,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../utils/currency';
import { storage } from '../utils/storage';
import { Admin as AdminApi } from '../services/api';
import { sendWhatsAppRelance, triggerInactivityCheck } from '../services/whatsapp';
import { Order, Product, User, OrderPricingSummary, PricingLine, RelanceLog } from '../types';
import { CATALOG_CATEGORIES } from '../data/catalog';
import { InventaireIndex } from './inventory';

type AdminPanel = 'panel-overview' | 'panel-products' | 'panel-orders' | 'panel-clients' | 'panel-inventory';

export const Admin: React.FC = () => {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [activePanel, setActivePanel] = useState<AdminPanel>('panel-overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  // Products state (Single source of truth loaded from backend)
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [prodSearchQuery, setProdSearchQuery] = useState('');
  const [prodCatFilter, setProdCatFilter] = useState('');
  const [prodCurrentPage, setProdCurrentPage] = useState(1);
  const prodItemsPerPage = 15;

  // Orders state
  const [ordersList, setOrdersList] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderFilterStatus, setOrderFilterStatus] = useState('');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // Users & Relances state (Loaded live from backend engine)
  const [usersList, setUsersList] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [relancesList, setRelancesList] = useState<RelanceLog[]>([]);
  const [relancesLoading, setRelancesLoading] = useState(false);
  const [userFilterStatus, setUserFilterStatus] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // ── MODAL STATES ──

  // Add Product Modal
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdDesc, setNewProdDesc] = useState('');
  const [newProdCat, setNewProdCat] = useState('Consommables');
  const [newProdSubCat, setNewProdSubCat] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('2500'); // Initial reference price
  const [newProdUnit, setNewProdUnit] = useState('Boîte');
  const [newProdStock, setNewProdStock] = useState('100');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdModalError, setNewProdModalError] = useState<string | null>(null);

  // Edit Product Modal (for modifying reference price and product details)
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProdName, setEditProdName] = useState('');
  const [editProdSku, setEditProdSku] = useState('');
  const [editProdCat, setEditProdCat] = useState('');
  const [editProdPrice, setEditProdPrice] = useState('');
  const [editProdUnit, setEditProdUnit] = useState('');
  const [editProdStock, setEditProdStock] = useState('');
  const [editProdActive, setEditProdActive] = useState(true);
  const [editProdError, setEditProdError] = useState<string | null>(null);

  // Chiffrage de Commande Modal
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [pricingOrder, setPricingOrder] = useState<Order | null>(null);
  const [pricingSummary, setPricingSummary] = useState<OrderPricingSummary | null>(null);
  const [pricingLinePrices, setPricingLinePrices] = useState<Record<string, number>>({});
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingActionLoading, setPricingActionLoading] = useState(false);

  // Relance Modal
  const [isRelanceModalOpen, setIsRelanceModalOpen] = useState(false);
  const [relanceUser, setRelanceUser] = useState<User | null>(null);
  const [relanceSubject, setRelanceSubject] = useState('📦 Nouveaux produits médicaux disponibles chez CYM Pharma');
  const [relanceMessage, setRelanceMessage] = useState(
    'Bonjour,\n\nNous avons récemment approvisionné notre stock en gants nitrile, compresses stériles et seringues 3 corps certifiés CE. Votre établissement bénéficie de nos tarifs B2B avec livraison express sur Abidjan.\n\nConnectez-vous pour consulter le catalogue.'
  );

  // Invoice Preview State
  const [previewInvoiceOrder, setPreviewInvoiceOrder] = useState<Order | null>(null);

  // Load initial backend data
  const loadProducts = async () => {
    setProductsLoading(true);
    try {
      const res = await AdminApi.products();
      if (res.success && res.data?.products) {
        setProductsList(res.data.products);
      }
    } catch (err) {
      console.warn('Failed to load products from API:', err);
    } finally {
      setProductsLoading(false);
    }
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await AdminApi.orders();
      if (res.success && res.data?.orders) {
        setOrdersList(res.data.orders);
      }
    } catch (err) {
      console.warn('Failed to load orders from API:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await AdminApi.users();
      if (res.success && res.data?.users) {
        setUsersList(res.data.users);
      }
    } catch (err) {
      console.warn('Failed to load users from API:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadRelances = async () => {
    setRelancesLoading(true);
    try {
      const res = await AdminApi.relances();
      if (res.success && res.data?.relances) {
        setRelancesList(res.data.relances);
      }
    } catch (err) {
      console.warn('Failed to load relances from API:', err);
    } finally {
      setRelancesLoading(false);
    }
  };

  const handleManualCheckInactivity = async () => {
    showToast('Vérification et relance automatique en cours…', 'info');
    try {
      // Appel direct à l'Edge Function Supabase (relance WhatsApp réelle)
      const res = await triggerInactivityCheck();
      if (res.success) {
        const sent = (res.relancesSent as any[]).filter((r) => r.status === 'sent').length;
        const failed = (res.relancesSent as any[]).filter((r) => r.status === 'failed').length;
        const msg = [
          res.newlyInactive.length > 0 ? `${res.newlyInactive.length} client(s) nouvellement inactif(s) détecté(s).` : null,
          sent > 0 ? `${sent} relance(s) WhatsApp envoyée(s).` : null,
          failed > 0 ? `${failed} échec(s) d'envoi WhatsApp.` : null,
        ].filter(Boolean).join(' ') || 'Aucun inactif détecté.';
        showToast(msg, sent > 0 ? 'success' : 'info');
        loadUsers();
        loadRelances();
      } else {
        showToast(res.message || 'Erreur lors de la vérification', 'error');
      }
    } catch (err: any) {
      // Fallback : appel API backend classique si Edge Function non disponible
      try {
        const res = await AdminApi.checkInactivity();
        if (res.success) {
          showToast(res.message || 'Vérification automatisée exécutée', 'success');
          loadUsers();
          loadRelances();
        }
      } catch {
        showToast(err?.message || 'Erreur lors de la vérification', 'error');
      }
    }
  };

  useEffect(() => {
    loadProducts();
    loadOrders();
    loadUsers();
    loadRelances();
  }, []);

  const sectionTitle = {
    'panel-overview': 'Tableau de bord',
    'panel-products': 'Gestion Produits & Prix de Référence (Privé Admin)',
    'panel-orders': 'Chiffrage des Commandes & Facturation',
    'panel-clients': 'Gestion des Utilisateurs',
    'panel-inventory': 'Gestion de l\'Inventaire & des Stocks (Privé Admin)',
  }[activePanel];

  // ── PRODUCT ACTIONS ──

  const handleOpenAddProduct = () => {
    setNewProdName('');
    setNewProdSku('');
    setNewProdDesc('');
    setNewProdCat('Consommables');
    setNewProdSubCat('');
    setNewProdPrice('2500');
    setNewProdUnit('Boîte');
    setNewProdStock('100');
    setNewProdBrand('');
    setNewProdModalError(null);
    setIsAddProductModalOpen(true);
  };

  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdSku.trim() || !newProdPrice) {
      setNewProdModalError('Veuillez renseigner tous les champs obligatoires (*).');
      return;
    }

    const priceNum = parseFloat(newProdPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setNewProdModalError('Le prix de référence doit être un nombre positif en FCFA.');
      return;
    }

    try {
      const payload: Partial<Product> = {
        name: newProdName.trim(),
        sku: newProdSku.trim(),
        reference: newProdSku.trim(),
        description_short: newProdDesc.trim(),
        category: newProdCat,
        category_main: newProdCat.toLowerCase(),
        category_sub: newProdSubCat.trim() || undefined,
        ref_price: priceNum,
        unit: newProdUnit.trim(),
        stock: parseInt(newProdStock, 10) || 0,
        brand: newProdBrand.trim() || undefined,
        is_active: true,
      };

      const res = await AdminApi.createProduct(payload);
      if (res.success && res.data?.product) {
        showToast(`Produit « ${res.data.product.name} » créé avec prix de référence ${formatCurrency(priceNum)}.`, 'success');
        setIsAddProductModalOpen(false);
        loadProducts();
      } else {
        setNewProdModalError(res.message || 'Erreur lors de la création');
      }
    } catch (err: any) {
      setNewProdModalError(err.message || 'Impossible de contacter le serveur');
    }
  };

  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setEditProdName(prod.name);
    setEditProdSku(prod.reference || prod.sku || '');
    setEditProdCat(prod.category || prod.category_main || 'Consommables');
    setEditProdPrice(String(prod.ref_price || prod.price || prod.base_price || 0));
    setEditProdUnit(prod.unit || 'Boîte');
    setEditProdStock(String(prod.stock ?? 100));
    setEditProdActive(prod.is_active !== false);
    setEditProdError(null);
    setIsEditProductModalOpen(true);
  };

  const handleEditProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const priceNum = parseFloat(editProdPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setEditProdError('Veuillez renseigner un prix de référence valide en FCFA.');
      return;
    }

    try {
      const res = await AdminApi.updateProduct(editingProduct.id, {
        name: editProdName.trim(),
        reference: editProdSku.trim(),
        sku: editProdSku.trim(),
        category: editProdCat,
        ref_price: priceNum,
        unit: editProdUnit.trim(),
        stock: parseInt(editProdStock, 10) || 0,
        is_active: editProdActive,
      });

      if (res.success) {
        showToast(`Prix de référence et informations mis à jour pour « ${editProdName} ».`, 'success');
        setIsEditProductModalOpen(false);
        setEditingProduct(null);
        loadProducts();
      } else {
        setEditProdError(res.message || 'Erreur de mise à jour');
      }
    } catch (err: any) {
      setEditProdError(err.message || 'Erreur réseau');
    }
  };

  const handleDeleteProduct = async (id: string | number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit du catalogue ?')) return;
    try {
      await AdminApi.deleteProduct(id);
      showToast('Produit retiré du catalogue.', 'warning');
      loadProducts();
    } catch {
      showToast('Suppression locale appliquée.', 'info');
      setProductsList((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleToggleProductActive = async (prod: Product) => {
    const nextState = prod.is_active === false;
    try {
      await AdminApi.updateProduct(prod.id, { is_active: nextState });
      showToast(nextState ? `Produit « ${prod.name} » réactivé` : `Produit « ${prod.name} » désactivé`, 'info');
      loadProducts();
    } catch {
      setProductsList((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, is_active: nextState } : p))
      );
    }
  };

  // ── CHIFFRAGE DE COMMANDE ACTIONS ──

  const handleOpenPricingModal = async (order: Order) => {
    setPricingOrder(order);
    setPricingLoading(true);
    setIsPricingModalOpen(true);
    setPricingLinePrices({});

    try {
      const res = await AdminApi.getOrderPricing(order.id);
      if (res.success && res.data?.pricingSummary) {
        const summary = res.data.pricingSummary;
        setPricingSummary(summary);

        // Pre-fill prices map
        const initialPrices: Record<string, number> = {};
        summary.lines.forEach((line) => {
          const key = String(line.productId);
          initialPrices[key] = (line.unit_price && line.unit_price > 0)
            ? line.unit_price
            : (line.ref_price || 0);
        });
        setPricingLinePrices(initialPrices);
      }
    } catch (err) {
      console.warn('Error loading order pricing:', err);
      showToast('Impossible de charger les données de chiffrage', 'error');
    } finally {
      setPricingLoading(false);
    }
  };

  const handleLinePriceChange = (productId: string | number, newPriceStr: string) => {
    const val = parseFloat(newPriceStr);
    setPricingLinePrices((prev) => ({
      ...prev,
      [String(productId)]: isNaN(val) ? 0 : val,
    }));
  };

  // Dynamically computed total for the modal without manual additions
  const computedPricingTotal = useMemo(() => {
    if (!pricingSummary) return 0;
    return pricingSummary.lines.reduce((acc, line) => {
      const p = pricingLinePrices[String(line.productId)] ?? (line.unit_price || line.ref_price || 0);
      return acc + (p * line.quantity);
    }, 0);
  }, [pricingSummary, pricingLinePrices]);

  const hasAnyMissingPrice = useMemo(() => {
    if (!pricingSummary) return false;
    return pricingSummary.lines.some((line) => {
      const p = pricingLinePrices[String(line.productId)];
      return p === undefined || p <= 0;
    });
  }, [pricingSummary, pricingLinePrices]);

  const handleSaveDraftPricing = async () => {
    if (!pricingOrder) return;
    setPricingActionLoading(true);

    try {
      const itemsPayload = Object.entries(pricingLinePrices).map(([productId, unit_price]) => ({
        productId,
        unit_price,
      }));

      const res = await AdminApi.saveOrderPricing(pricingOrder.id, itemsPayload);
      if (res.success) {
        showToast('Brouillon de chiffrage enregistré avec succès.', 'success');
        loadOrders();
      } else {
        showToast(res.message || 'Erreur lors de l’enregistrement', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erreur réseau', 'error');
    } finally {
      setPricingActionLoading(false);
    }
  };

  const handleValidatePricing = async () => {
    if (!pricingOrder) return;
    if (hasAnyMissingPrice) {
      showToast('Tous les articles doivent posséder un prix unitaire supérieur à 0 pour calculer et émettre la facture.', 'warning');
      return;
    }

    setPricingActionLoading(true);

    try {
      const itemsPayload = Object.entries(pricingLinePrices).map(([productId, unit_price]) => ({
        productId,
        unit_price,
      }));

      const res = await AdminApi.validateOrderPricing(pricingOrder.id, itemsPayload);
      if (res.success) {
        const orderRef = pricingOrder.orderNumber || pricingOrder.id;
        showToast(`Facture calculée et transmise avec succès au client pour la commande ${orderRef} ! Montant total : ${formatCurrency(computedPricingTotal)}`, 'success');
        setIsPricingModalOpen(false);
        loadOrders();
      } else {
        showToast(res.message || 'Impossible de valider et transmettre la facture', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la validation', 'error');
    } finally {
      setPricingActionLoading(false);
    }
  };

  const handleOpenInvoice = (order: Order) => {
    storage.setBLCurrentOrder(order);
    window.open(`/facture?id=${order.id}`, '_blank');
  };

  const handleUpdateUserStatus = async (userId: string | number, newStatus: string) => {
    try {
      const res = await AdminApi.updateUserStatus(userId, newStatus);
      if (res.success) {
        showToast(`Statut utilisateur mis à jour : ${newStatus}`, 'success');
        loadUsers();
      }
    } catch {
      setUsersList((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
      );
    }
  };

  const handleOpenRelanceModal = (user: User) => {
    setRelanceUser(user);
    const clientTitle = user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : (user.name || 'Client');
    const structureName = user.establishment_name || 'votre établissement de santé';
    const daysStr = user.days_since_last_order ? `${user.days_since_last_order} jours` : 'plus de deux mois';

    setRelanceSubject(`Reprise de vos approvisionnements médicaux — CYM Pharma (${structureName})`);
    setRelanceMessage(
      `Bonjour ${clientTitle},\n\nL'équipe commerciale de CYM Pharma espère que vous allez bien.\n\nNous constatons que ${structureName}, qui commandait habituellement chaque mois auprès de notre centrale, n'a passé aucune commande depuis ${daysStr}.\n\nDe nouveaux arrivages de consommables hospitaliers certifiés CE / ISO sont immédiatement disponibles dans notre entrepôt d'Abidjan (gants nitrile, sondes médicales, compresses, aiguilles, fils de suture).\n\nVous bénéficiez de vos tarifs partenaires B2B et d'une livraison express garantie sous 2h à Abidjan.\n\nSouhaitez-vous recevoir notre proforma actualisée ?\n\nContact direct : +225 07 09 55 40 20 • Email : commandes@cympharma.ci\n\nBien cordialement,\nCYM PHARMA SARL`
    );
    setIsRelanceModalOpen(true);
  };

  const handleSendRelance = async () => {
    if (!relanceUser) return;
    if (!relanceSubject.trim() || !relanceMessage.trim()) {
      showToast("Veuillez renseigner l'objet et le message de relance.", 'error');
      return;
    }

    try {
      // Appel à l'Edge Function Supabase whatsapp-relance (envoi WhatsApp réel)
      const waRes = await sendWhatsAppRelance(String(relanceUser.id), {
        subject: relanceSubject,
        message: relanceMessage,
        channel: 'multichannel',
      });

      if (waRes.relance) {
        const status = waRes.relance.status;
        const waUrl = waRes.relance.whatsappDirectUrl;

        if (status === 'sent') {
          showToast(`Relance WhatsApp envoyée à ${relanceUser.establishment_name || relanceUser.name}.`, 'success');
        } else if (status === 'failed' && waUrl) {
          showToast(
            `Échec envoi WhatsApp automatique. Lien direct généré — cliquez Ouvrir WhatsApp.`,
            'warning'
          );
          // Ouvrir le lien WhatsApp direct en secours
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        } else {
          showToast(waRes.message || 'Relance enregistrée (WhatsApp non configuré).', 'info');
        }

        setIsRelanceModalOpen(false);
        loadUsers();
        loadRelances();
      } else {
        // Fallback API REST classique si Edge Function non disponible
        const res = await AdminApi.sendRelance(relanceUser.id, {
          subject: relanceSubject,
          message: relanceMessage,
          channel: 'multichannel',
        });
        if (res.success) {
          showToast(`Relance enregistrée pour ${relanceUser.establishment_name || relanceUser.name}.`, 'success');
          setIsRelanceModalOpen(false);
          loadUsers();
          loadRelances();
        } else {
          showToast(res.message || 'Erreur lors de la relance', 'error');
        }
      }
    } catch (err: any) {
      // Fallback final
      try {
        const res = await AdminApi.sendRelance(relanceUser.id, {
          subject: relanceSubject,
          message: relanceMessage,
          channel: 'multichannel',
        });
        if (res.success) {
          showToast(`Relance enregistrée pour ${relanceUser.establishment_name || relanceUser.name}.`, 'success');
          setIsRelanceModalOpen(false);
          loadUsers();
          loadRelances();
        } else {
          showToast(res.message || 'Erreur lors de la relance', 'error');
        }
      } catch {
        showToast(err?.message || 'Erreur lors de l\'envoi de la relance', 'error');
      }
    }
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return productsList.filter((p) => {
      const matchesCat = !prodCatFilter || (p.category_main && p.category_main.toLowerCase() === prodCatFilter.toLowerCase()) || (p.category && p.category.toLowerCase().includes(prodCatFilter.toLowerCase()));
      const q = (prodSearchQuery || globalSearch).toLowerCase().trim();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.reference && p.reference.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q));
      return matchesCat && matchesQuery;
    });
  }, [productsList, prodCatFilter, prodSearchQuery, globalSearch]);

  const totalProdPages = Math.ceil(filteredProducts.length / prodItemsPerPage) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (prodCurrentPage - 1) * prodItemsPerPage;
    return filteredProducts.slice(start, start + prodItemsPerPage);
  }, [filteredProducts, prodCurrentPage]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return ordersList.filter((o) => {
      const statusLower = (o.status || '').toLowerCase();
      let matchesStatus = true;
      if (orderFilterStatus === 'a_chiffrer') {
        matchesStatus = statusLower.includes('chiffrer') || statusLower === 'a_chiffrer' || statusLower === 'pending';
      } else if (orderFilterStatus === 'chiffree') {
        matchesStatus = statusLower.includes('chiffrée') || statusLower.includes('chiffree') || statusLower === 'confirmed' || statusLower === 'validated';
      } else if (orderFilterStatus === 'delivered') {
        matchesStatus = statusLower === 'delivered' || statusLower === 'livrée';
      } else if (orderFilterStatus === 'cancelled') {
        matchesStatus = statusLower === 'cancelled' || statusLower === 'annulée';
      }

      const q = (orderSearchQuery || globalSearch).toLowerCase().trim();
      const matchesQuery =
        !q ||
        (o.order_number && o.order_number.toLowerCase().includes(q)) ||
        (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
        (o.establishment_name && o.establishment_name.toLowerCase().includes(q)) ||
        (o.shipping_city && o.shipping_city.toLowerCase().includes(q));

      return matchesStatus && matchesQuery;
    });
  }, [ordersList, orderFilterStatus, orderSearchQuery, globalSearch]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchesStatus = !userFilterStatus || u.status === userFilterStatus;
      const q = (userSearchQuery || globalSearch).toLowerCase().trim();
      const matchesQuery =
        !q ||
        `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.establishment_name && u.establishment_name.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [usersList, userFilterStatus, userSearchQuery, globalSearch]);

  // Unique categories for filter
  const productCategories = useMemo(() => {
    const set = new Set<string>();
    productsList.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [productsList]);

  return (
    <div className="antialiased min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* TOPBAR ADMIN */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200/80 z-50 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="lg:hidden text-slate-600 hover:text-slate-900 cursor-pointer"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Menu latéral"
          >
            <Menu className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <Link to="/accueil" className="flex items-center gap-2" aria-label="CYM Pharma — Accueil">
            <img src="/LOGO.png" alt="CYM Pharma" className="h-10 w-auto object-contain" />
          </Link>
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-700">Hub Central Abidjan</span>
            <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full border border-slate-200">
              Admin Sécurisé
            </span>
          </div>
        </div>

        {/* Global Search Bar */}
        <div
          className="hidden md:flex items-center gap-2 w-96 px-3.5 py-1.5 rounded-xl border border-slate-200"
          style={{ background: 'var(--surface-alt)' }}
        >
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
          <input
            id="admin-search"
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Rechercher produit, prix, commande, client..."
            className="bg-transparent border-0 outline-none w-full text-xs text-slate-700 placeholder:text-slate-400"
          />
        </div>
      </header>

      {/* LAYOUT CONTAINER */}
      <div className="flex pt-16 min-h-screen">
        {/* Backdrop flou mobile / tablette lors de l'ouverture du menu burger */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-16 z-30 bg-slate-900/40 backdrop-blur-md transition-opacity duration-300 lg:hidden cursor-pointer"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu latéral"
          />
        )}

        {/* SIDEBAR */}
        <aside
          id="admin-sidebar"
          className={`sidebar w-64 shrink-0 bg-white border-r border-slate-200/80 p-4 fixed top-16 bottom-0 z-40 shadow-2xl lg:shadow-none flex flex-col justify-between transition-transform duration-300 ${
            sidebarOpen ? 'flex translate-x-0' : 'hidden lg:flex'
          }`}
        >
          <div className="space-y-6">
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-3 mb-2">
                Supervision &amp; Flux
              </p>
              <nav className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className={`admin-nav-item ${activePanel === 'panel-overview' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePanel('panel-overview');
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-icon-wrap">
                    <TrendingUp className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Tableau de bord</span>
                </button>

                <button
                  type="button"
                  className={`admin-nav-item ${activePanel === 'panel-products' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePanel('panel-products');
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-icon-wrap">
                    <Package className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Gestion Produits</span>
                </button>
                <button
                  type="button"
                  className={`admin-nav-item ${activePanel === 'panel-inventory' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePanel('panel-inventory');
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-icon-wrap">
                    <Boxes className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Inventaire &amp; Stocks</span>
                </button>

                <button
                  type="button"
                  className={`admin-nav-item ${activePanel === 'panel-orders' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePanel('panel-orders');
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-icon-wrap">
                    <Calculator className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Chiffrage &amp; Facturation</span>
                </button>

                <button
                  type="button"
                  className={`admin-nav-item ${activePanel === 'panel-clients' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePanel('panel-clients');
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-icon-wrap">
                    <Users className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Utilisateurs</span>
                </button>
              </nav>
            </div>

            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-3 mb-2">
                Espace Public
              </p>
              <nav className="space-y-1">
                <Link
                  to="/catalogue"
                  className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                  <span>Voir Catalogue (sans prix)</span>
                </Link>
                <Link
                  to="/accueil"
                  className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition"
                >
                  <Home className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} />
                  <span>Accueil Public</span>
                </Link>
              </nav>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              id="logout"
              type="button"
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
              onClick={() => {
                logout();
                navigate('/accueil');
              }}
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>

        {/* MAIN WORKSPACE */}
        <main className="flex-1 lg:ml-64 p-6 sm:p-8 lg:p-10 min-w-0">
          {/* Header Title */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 id="section-title" className="text-2xl font-bold tracking-tight text-slate-900">
                {sectionTitle}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Catalogue hospitalier B2B, chiffrage des commandes et facturation réglementaire Abidjan.
              </p>
            </div>

          </div>

          {/* ================= PANEL 1: OVERVIEW ================= */}
          {activePanel === 'panel-overview' && (
            <div id="panel-overview" className="panel active space-y-6">
              {/* 4 KPIs Clés Grossiste */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="admin-card p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="admin-kpi-label">Commandes à chiffrer</span>
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'var(--warning-tint)', color: 'var(--warning)' }}
                    >
                      <Clock className="w-4 h-4" strokeWidth={2} />
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700">
                    {ordersList.filter((o) => (o.status || '').toLowerCase().includes('chiffrer') || o.status === 'pending').length}
                  </p>
                  <p className="text-[11px] text-amber-600 font-semibold mt-1">À traiter en priorité</p>
                </div>

                <div className="admin-card p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="admin-kpi-label">Commandes chiffrées</span>
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'var(--primary-tint)', color: 'var(--primary)' }}
                    >
                      <CheckCheck className="w-4 h-4" strokeWidth={2} />
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-[#155E95]">
                    {ordersList.filter((o) => (o.status || '').toLowerCase().includes('chiffrée') || o.status === 'confirmed').length}
                  </p>
                  <p className="text-[11px] text-blue-600 font-semibold mt-1">Tarifs validés</p>
                </div>

                <div className="admin-card p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="admin-kpi-label">Références catalogue</span>
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'var(--success-tint)', color: 'var(--success)' }}
                    >
                      <Package className="w-4 h-4" strokeWidth={2} />
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {productsList.length} <span className="text-xs font-normal text-slate-500">articles</span>
                  </p>
                  <p className="text-[11px] text-emerald-600 font-semibold mt-1">Avec prix de référence privé</p>
                </div>

                <div className="admin-card p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="admin-kpi-label">Établissements clients</span>
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'var(--surface-alt)', color: 'var(--text)' }}
                    >
                      <Users className="w-4 h-4" strokeWidth={2} />
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {usersList.length} <span className="text-xs font-normal text-slate-500">comptes</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Cliniques &amp; Officines</p>
                </div>
              </div>

              {/* Dernières réquisitions */}
              <div className="admin-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                      Réquisitions récentes reçues
                    </h3>
                    <p className="text-xs text-slate-400">Ouvrez le détail pour effectuer le chiffrage</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActivePanel('panel-orders')}
                    className="text-xs font-bold text-[var(--primary)] hover:underline"
                  >
                    Voir tout le module chiffrage
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 font-semibold">N° Commande</th>
                        <th className="pb-3 font-semibold">Structure Clinique</th>
                        <th className="pb-3 font-semibold">Date</th>
                        <th className="pb-3 font-semibold text-center">Articles</th>
                        <th className="pb-3 font-semibold">Montant chiffré</th>
                        <th className="pb-3 font-semibold">Statut</th>
                        <th className="pb-3 font-semibold text-right">Action Chiffrage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ordersList.slice(0, 5).map((ord) => {
                        const isAChiffrer = (ord.status || '').toLowerCase().includes('chiffrer') || ord.status === 'pending';
                        return (
                          <tr key={ord.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 font-bold font-mono text-[#155E95]">
                              {ord.order_number || ord.orderNumber || ord.id}
                            </td>
                            <td className="py-3.5 font-semibold text-slate-800">
                              {ord.establishment_name}
                            </td>
                            <td className="py-3.5 text-slate-500">
                              {ord.created_at ? ord.created_at.slice(0, 10) : ''}
                            </td>
                            <td className="py-3.5 text-center font-bold text-slate-700">
                              {ord.item_count || ord.items?.length || 1}
                            </td>
                            <td className="py-3.5 font-bold">
                              {ord.total ? formatCurrency(ord.total) : <span className="text-slate-400 font-normal italic">En attente</span>}
                            </td>
                            <td className="py-3.5">
                              {isAChiffrer ? (
                                <span className="status-pill status-pill-amber">À chiffrer</span>
                              ) : (
                                <span className="status-pill status-pill-green">Chiffrée</span>
                              )}
                            </td>
                            <td className="py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenPricingModal(ord)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ml-auto cursor-pointer ${
                                  isAChiffrer
                                    ? 'bg-[var(--primary)] text-white hover:brightness-110 shadow-xs'
                                    : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <Calculator className="w-3.5 h-3.5" />
                                <span>{isAChiffrer ? 'Chiffrer' : 'Voir Chiffrage'}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PANEL 2: GESTION PRODUITS & PRIX DE RÉFÉRENCE ================= */}
          {activePanel === 'panel-products' && (
            <div id="panel-products" className="panel active space-y-6">

              <div className="admin-card p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Catalogue des Dispositifs &amp; Consommables
                    </h2>
                    <p className="text-xs text-slate-500">
                      {productsList.length} articles référencés avec prix de base B2B administrable.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadProducts}
                      title="Rafraîchir"
                      className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${productsLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      id="btn-open-add-product"
                      type="button"
                      onClick={handleOpenAddProduct}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition hover:brightness-110 cursor-pointer"
                      style={{ background: 'var(--primary)' }}
                    >
                      <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                      <span>Nouveau Produit</span>
                    </button>
                  </div>
                </div>

                {/* Filtres & Recherche Produits */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div
                    className="sm:col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200"
                    style={{ background: 'var(--surface-alt)' }}
                  >
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
                    <input
                      type="text"
                      value={prodSearchQuery}
                      onChange={(e) => {
                        setProdSearchQuery(e.target.value);
                        setProdCurrentPage(1);
                      }}
                      placeholder="Rechercher par désignation, référence SKU, catégorie..."
                      className="bg-transparent border-0 outline-none w-full text-xs text-slate-700 placeholder:text-slate-400"
                    />
                  </div>

                  <div>
                    <select
                      value={prodCatFilter}
                      onChange={(e) => {
                        setProdCatFilter(e.target.value);
                        setProdCurrentPage(1);
                      }}
                      className="w-full h-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="">Toutes les catégories ({productsList.length})</option>
                      {productCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Table Produits */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Référence</th>
                        <th className="pb-3 font-semibold">Désignation</th>
                        <th className="pb-3 font-semibold">Catégorie</th>
                        <th className="pb-3 font-semibold text-emerald-800">
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3 text-emerald-600" />
                            <span>Prix de référence</span>
                          </span>
                        </th>
                        <th className="pb-3 font-semibold">Conditionnement / Unité</th>
                        <th className="pb-3 font-semibold">Statut</th>
                        <th className="pb-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedProducts.map((p) => {
                        const price = p.ref_price || p.price || p.base_price || 0;
                        const isActive = p.is_active !== false;

                        return (
                          <tr key={p.id} className={`hover:bg-slate-50 transition ${!isActive ? 'opacity-60 bg-slate-50/50' : ''}`}>
                            <td className="py-3.5 font-mono font-bold text-slate-700">
                              {p.reference || p.sku || `REF-${p.id}`}
                            </td>
                            <td className="py-3.5 font-bold text-slate-900 max-w-xs leading-snug">
                              {p.name}
                            </td>
                            <td className="py-3.5 text-slate-600">
                              {p.category || p.category_main}
                            </td>
                            <td className="py-3.5 font-bold font-mono text-emerald-700">
                              {price > 0 ? (
                                <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  {formatCurrency(price)}
                                </span>
                              ) : (
                                <span className="text-rose-500 font-semibold italic bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                  Non défini
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 text-slate-500">
                              {p.conditionnement || p.unit || 'Boîte'}
                            </td>
                            <td className="py-3.5">
                              <button
                                type="button"
                                onClick={() => handleToggleProductActive(p)}
                                title="Cliquer pour activer/désactiver"
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition ${
                                  isActive
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                }`}
                              >
                                {isActive ? 'Actif' : 'Désactivé'}
                              </button>
                            </td>
                            <td className="py-3.5 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleOpenEditProduct(p)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer inline-flex items-center gap-1"
                                aria-label="Modifier"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Modifier prix</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(p.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition inline-flex"
                                aria-label="Supprimer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100 text-xs">
                  <p className="text-slate-500">
                    Affichage de {paginatedProducts.length} sur {filteredProducts.length} références
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={prodCurrentPage <= 1}
                      onClick={() => setProdCurrentPage((prev) => Math.max(1, prev - 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-semibold text-slate-700">
                      Page {prodCurrentPage} / {totalProdPages}
                    </span>
                    <button
                      type="button"
                      disabled={prodCurrentPage >= totalProdPages}
                      onClick={() => setProdCurrentPage((prev) => Math.min(totalProdPages, prev + 1))}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= PANEL 3: CHIFFRAGE DES COMMANDES & FACTURATION ================= */}
          {activePanel === 'panel-orders' && (
            <div id="panel-orders" className="panel active space-y-6">
              {/* Cartes KPI */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Total Commandes</p>
                  <p className="text-2xl font-bold text-slate-900">{ordersList.length}</p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-amber-600 mb-1">À chiffrer</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {ordersList.filter((o) => (o.status || '').toLowerCase().includes('chiffrer') || o.status === 'pending').length}
                  </p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Factures émises</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {ordersList.filter((o) => (o.status || '').toLowerCase().includes('chiffrée') || (o.status || '').toLowerCase().includes('facture') || o.status === 'confirmed').length}
                  </p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Commandes livrées</p>
                  <p className="text-2xl font-bold text-slate-700">
                    {ordersList.filter((o) => o.status === 'delivered').length}
                  </p>
                </div>
              </div>

              <div className="admin-card p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Rubrique « Chiffrage des commandes &amp; Facturation B2B »
                    </h2>
                    <p className="text-xs text-slate-500">
                      Calcul automatique du prix total des articles et transmission de la facture au client.
                    </p>
                  </div>
                  {/* Filtres statut commandes */}
                  <div id="o-filters" className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOrderFilterStatus('')}
                      className={`u-filter-btn ${orderFilterStatus === '' ? 'active' : ''}`}
                    >
                      Toutes
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderFilterStatus('a_chiffrer')}
                      className={`u-filter-btn ${orderFilterStatus === 'a_chiffrer' ? 'active' : ''}`}
                    >
                      À chiffrer
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderFilterStatus('chiffree')}
                      className={`u-filter-btn ${orderFilterStatus === 'chiffree' ? 'active' : ''}`}
                    >
                      Chiffrées
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderFilterStatus('delivered')}
                      className={`u-filter-btn ${orderFilterStatus === 'delivered' ? 'active' : ''}`}
                    >
                      Livrées
                    </button>
                  </div>
                </div>

                {/* Barre recherche commandes */}
                <div
                  className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl border border-slate-200"
                  style={{ background: 'var(--surface-alt)' }}
                >
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={2} />
                  <input
                    id="o-search"
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="Rechercher par n° de commande, établissement, commune..."
                    className="bg-transparent border-0 outline-none w-full text-xs text-slate-700 placeholder:text-slate-400"
                  />
                </div>

                {/* Table commandes */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 font-semibold">N° Commande</th>
                        <th className="pb-3 font-semibold">Date</th>
                        <th className="pb-3 font-semibold">Établissement demandeur</th>
                        <th className="pb-3 font-semibold">Commune</th>
                        <th className="pb-3 font-semibold text-center">Articles</th>
                        <th className="pb-3 font-semibold">Montant Chiffré</th>
                        <th className="pb-3 font-semibold">Statut</th>
                        <th className="pb-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody id="orders-table-body" className="divide-y divide-slate-100">
                      {filteredOrders.map((o) => {
                        const isAChiffrer = (o.status || '').toLowerCase().includes('chiffrer') || o.status === 'pending';
                        return (
                          <tr key={o.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 font-mono font-bold text-slate-900">
                              {o.order_number || o.orderNumber || o.id}
                            </td>
                            <td className="py-3.5 text-slate-500">
                              {o.created_at ? o.created_at.substring(0, 10) : ''}
                            </td>
                            <td className="py-3.5 font-bold text-slate-800">
                              {o.establishment_name}
                            </td>
                            <td className="py-3.5 text-slate-600">{o.shipping_city || 'Abidjan'}</td>
                            <td className="py-3.5 text-center font-bold text-slate-700">
                              {o.item_count || o.items?.length || 1}
                            </td>
                            <td className="py-3.5 font-bold">
                              {o.total ? (
                                <span className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  {formatCurrency(o.total)}
                                </span>
                              ) : (
                                <span className="text-amber-700 font-semibold italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  À chiffrer
                                </span>
                              )}
                            </td>
                            <td className="py-3.5">
                              {isAChiffrer ? (
                                <span className="status-pill status-pill-amber">À chiffrer</span>
                              ) : (
                                <span className="status-pill status-pill-green">Chiffrée</span>
                              )}
                            </td>
                            <td className="py-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPricingModal(o)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer ${
                                    isAChiffrer
                                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                                      : 'border border-slate-200 text-slate-700 bg-white hover:bg-slate-100'
                                  }`}
                                >
                                  <Calculator className="w-3.5 h-3.5" />
                                  <span>{isAChiffrer ? 'Calculer le prix' : 'Modifier prix'}</span>
                                </button>
                                {!isAChiffrer && (
                                  <Link
                                    to={`/facture?id=${o.id}`}
                                    target="_blank"
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer"
                                    title="Consulter la Facture A4"
                                  >
                                    <FileText className="w-3 h-3 text-[var(--primary)]" />
                                    <span>Facture A4</span>
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= PANEL 4: UTILISATEURS & RELANCES AUTOMATIQUES ================= */}

          {/* ================= PANEL 5: INVENTAIRE & STOCKS (ADMIN PRIVÉ) ================= */}
          {activePanel === 'panel-inventory' && (
            <div id="panel-inventory" className="panel active space-y-6">
              <InventaireIndex />
            </div>
          )}

          {activePanel === 'panel-clients' && (
            <div id="panel-clients" className="panel active space-y-6">
              {/* Automation Engine Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-extrabold uppercase tracking-widest text-blue-200">
                      Module d'Inactivité &amp; Relances Automatiques B2B
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold">
                    Supervision proactive des commandes officinales &amp; hospitalières
                  </h3>
                  <p className="text-xs text-blue-100 max-w-2xl leading-relaxed">
                    Les clients réguliers sans commande depuis plus de 60 jours sont automatiquement basculés en statut <strong>« Inactif »</strong> côté backend et reçoivent immédiatement un message de réapprovisionnement personnalisé via <strong>WhatsApp Business (+225 07 09 55 40 20)</strong> et Email.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleManualCheckInactivity}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white text-blue-900 hover:bg-blue-50 transition shadow-sm inline-flex items-center gap-2 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Vérifier &amp; Relancer maintenant</span>
                </button>
              </div>

              {/* 4 KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Total Utilisateurs</p>
                  <p className="text-2xl font-bold text-slate-900">{usersList.length}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Comptes enregistrés</p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Actifs (&lt; 60j)</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {usersList.filter((u) => u.status === 'active').length}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">Commandes régulières</p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Inactifs (&gt; 60j)</p>
                  <p className="text-2xl font-bold text-rose-600">
                    {usersList.filter((u) => u.status === 'inactive' || (typeof u.days_since_last_order === 'number' && u.days_since_last_order > 60)).length}
                  </p>
                  <p className="text-[11px] text-rose-600 font-medium mt-0.5">Détectés automatiquement</p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Relances Envoyées</p>
                  <p className="text-2xl font-bold text-[var(--primary)]">
                    {relancesList.length}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">WhatsApp / Email B2B</p>
                </div>
              </div>

              {/* Client List Table */}
              <div className="admin-card p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Gestion des Comptes Clients &amp; Établissements</h2>
                    <p className="text-xs text-slate-500">Statuts d'activité, commandes mensuelles et suivi des relances</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[10px]">
                        <th className="pb-3 font-semibold">Client / Contact</th>
                        <th className="pb-3 font-semibold">Établissement</th>
                        <th className="pb-3 font-semibold">Fréquence &amp; Dernière commande</th>
                        <th className="pb-3 font-semibold">Statut</th>
                        <th className="pb-3 font-semibold">Dernière Relance</th>
                        <th className="pb-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody id="u-table-body" className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => {
                        const isInactive = u.status === 'inactive' || (typeof u.days_since_last_order === 'number' && u.days_since_last_order > 60);
                        const daysAgo = typeof u.days_since_last_order === 'number' ? u.days_since_last_order : null;

                        return (
                          <tr key={u.id} className="hover:bg-slate-50 transition">
                            <td className="py-3">
                              <p className="font-bold text-slate-900">{u.first_name || ''} {u.last_name || ''}</p>
                              <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                              <p className="text-[11px] text-slate-600">{u.phone || 'Non renseigné'}</p>
                            </td>
                            <td className="py-3">
                              <p className="font-semibold text-slate-800">{u.establishment_name || 'Sans structure'}</p>
                              <p className="text-[11px] text-slate-400">{u.commune || 'Abidjan'} • {u.establishment_type || 'B2B'}</p>
                            </td>
                            <td className="py-3">
                              <div className="space-y-0.5">
                                <span className="font-semibold text-slate-700 block">
                                  {u.total_orders || 0} commande(s) passée(s)
                                </span>
                                {daysAgo !== null ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                      daysAgo > 60
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}
                                  >
                                    <Clock className="w-3 h-3" />
                                    <span>Il y a {daysAgo} jours</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">Aucune commande</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3">
                              {isInactive ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Inactif (&gt; 60j)</span>
                                </span>
                              ) : u.status === 'active' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Actif</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <span>En attente</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3">
                              {u.last_relance_at ? (
                                <div className="space-y-0.5">
                                  <span className="text-[10.5px] font-bold text-slate-800 block">
                                    {new Date(u.last_relance_at).toLocaleDateString('fr-FR', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                  {u.last_relance_status === 'sent' || u.last_relance_status === 'delivered' ? (
                                    <span className="text-[9.5px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block">
                                      Envoyée ({u.relance_count || 1}x)
                                    </span>
                                  ) : u.last_relance_status === 'failed' ? (
                                    <span className="text-[9.5px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 inline-block">
                                      Échec ({u.relance_count || 1}x)
                                    </span>
                                  ) : (
                                    <span className="text-[9.5px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block">
                                      En attente ({u.relance_count || 1}x)
                                    </span>
                                  )}
                                </div>
                              ) : isInactive ? (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  À relancer
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Non requis</span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenRelanceModal(u)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer shadow-2xs"
                                  title="Ouvrir le message de relance B2B"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Relancer</span>
                                </button>
                                <select
                                  value={u.status}
                                  onChange={(e) => handleUpdateUserStatus(u.id, e.target.value)}
                                  className="text-[11px] font-semibold py-1 px-2 rounded-lg border border-slate-200 bg-white cursor-pointer"
                                >
                                  <option value="active">Actif</option>
                                  <option value="pending">En attente</option>
                                  <option value="inactive">Inactif</option>
                                </select>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Real Audit Trail Table of Automated Relances */}
              <div className="admin-card p-6">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Journal d'audit des Relances B2B (WhatsApp Business &amp; Email Pro)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Historique certifié des messages de réapprovisionnement expédiés aux établissements
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {relancesList.length} relance(s) tracée(s)
                  </span>
                </div>

                {relancesList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">
                    Aucune relance envoyée pour le moment.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider">
                          <th className="pb-2.5 font-semibold">Date &amp; Heure</th>
                          <th className="pb-2.5 font-semibold">Destinataire</th>
                          <th className="pb-2.5 font-semibold">Motif Déclencheur</th>
                          <th className="pb-2.5 font-semibold">Canal</th>
                          <th className="pb-2.5 font-semibold">Statut</th>
                          <th className="pb-2.5 font-semibold text-right">Lien direct</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {relancesList.map((rel) => (
                          <tr key={rel.id} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 text-slate-600 font-medium">
                              {new Date(rel.sent_at).toLocaleString('fr-FR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-2.5">
                              <p className="font-bold text-slate-900">{rel.establishmentName}</p>
                              <p className="text-[10.5px] text-slate-500">{rel.userName} • {rel.recipientPhone}</p>
                            </td>
                            <td className="py-2.5 text-slate-700">
                              <span className="text-[11px] bg-slate-100 px-2 py-0.5 rounded font-medium">
                                {rel.triggerReason}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                WhatsApp &amp; Email
                              </span>
                            </td>
                            <td className="py-2.5">
                              {rel.status === 'sent' || rel.status === 'delivered' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{rel.status === 'delivered' ? 'Distribué' : 'Envoyé'}</span>
                                </span>
                              ) : rel.status === 'failed' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Échec API</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  <Clock className="w-3 h-3" />
                                  <span>En attente</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 text-right">
                              {rel.whatsappDirectUrl && (
                                <a
                                  href={rel.whatsappDirectUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Ouvrir WhatsApp</span>
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ══ MODALE CHIFFRAGE DE COMMANDE (EXIGENCE RUBRIQUE 3) ══ */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {isPricingModalOpen && pricingOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="modal-box w-full max-w-[850px] bg-white rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header Chiffrage */}
            <div className="modal-header flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm"
                  style={{ background: 'var(--primary)' }}
                >
                  <Calculator className="w-5 h-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Chiffrage de la commande {pricingOrder.orderNumber || pricingOrder.id}
                    </h2>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {pricingOrder.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Client : <strong>{pricingOrder.establishment_name}</strong> • Commune : {pricingOrder.shipping_city || 'Abidjan'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPricingModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corps Chiffrage */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Instructions de commande éventuelles */}
              {pricingOrder.shipping_notes && (
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Instructions du client :</span> {pricingOrder.shipping_notes}
                  </div>
                </div>
              )}

              {/* Tableau conforme à l'exigence Rubrique 3 */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-3 px-4">Désignation</th>
                      <th className="py-3 px-3 text-right">Quantité</th>
                      <th className="py-3 px-4 text-right">Prix de référence</th>
                      <th className="py-3 px-4 text-right">Total ligne</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pricingSummary?.lines.map((line) => {
                      const currentUnitPrice = pricingLinePrices[String(line.productId)] ?? (line.unit_price || line.ref_price || 0);
                      const currentLineTotal = currentUnitPrice * line.quantity;
                      const isMissing = !currentUnitPrice || currentUnitPrice <= 0;

                      return (
                        <tr key={String(line.productId)} className={`hover:bg-slate-50/80 transition ${isMissing ? 'bg-rose-50/40' : ''}`}>
                          {/* 1. Désignation */}
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            <p>{line.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {line.reference && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  Réf. {line.reference}
                                </span>
                              )}
                              {line.unit && (
                                <span className="text-[10px] text-slate-400">
                                  • {line.unit}
                                </span>
                              )}
                              {isMissing && (
                                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Prix manquant</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. Quantité */}
                          <td className="py-3.5 px-3 text-right font-bold text-slate-800 text-sm">
                            {line.quantity}
                          </td>

                          {/* 3. Prix de référence administrable */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="50"
                                value={currentUnitPrice || ''}
                                onChange={(e) => handleLinePriceChange(line.productId, e.target.value)}
                                placeholder="0"
                                className={`w-28 px-2.5 py-1 text-right font-mono font-bold text-xs rounded-lg border outline-none focus:ring-1 focus:ring-[var(--primary)] ${
                                  isMissing
                                    ? 'border-red-400 bg-red-50/80 text-red-700'
                                    : 'border-slate-200 bg-white text-slate-900'
                                }`}
                              />
                              <span className="text-slate-400 text-[11px] font-medium">FCFA</span>
                            </div>
                            {line.ref_price && line.ref_price !== currentUnitPrice && (
                              <p className="text-[10px] text-slate-400 text-right mt-0.5">
                                Base catalogue : {formatCurrency(line.ref_price)}
                              </p>
                            )}
                          </td>

                          {/* 4. Total ligne */}
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm whitespace-nowrap">
                            {currentLineTotal > 0 ? (
                              formatCurrency(currentLineTotal)
                            ) : (
                              <span className="text-red-500 font-semibold italic text-xs">À renseigner</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Ligne Total Commande automatique */}
                  <tfoot>
                    <tr className="bg-slate-100/90 font-extrabold text-slate-900 border-t-2 border-slate-300">
                      <td className="py-4 px-4 text-sm font-extrabold uppercase tracking-wide">
                        Total commande
                      </td>
                      <td className="py-4 px-3 text-right text-sm">
                        {pricingSummary?.totalQuantity || 0}
                      </td>
                      <td className="py-4 px-4 text-right text-xs text-slate-500 font-normal">
                        Calcul automatique lignes
                      </td>
                      <td className="py-4 px-4 text-right text-base text-[var(--primary)] font-mono font-black whitespace-nowrap">
                        {formatCurrency(computedPricingTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Message d'alerte si un prix est manquant */}
              {hasAnyMissingPrice && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Validation bloquée :</strong> certains articles n'ont pas de prix renseigné. Veuillez définir un prix pour chaque ligne avant de valider le chiffrage.
                  </span>
                </div>
              )}
            </div>

            {/* Footer Modal avec Actions */}
            <div className="modal-footer flex items-center justify-between p-5 border-t border-slate-100 bg-slate-50/70 shrink-0">
              <button
                type="button"
                onClick={() => setIsPricingModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
              >
                Fermer
              </button>

                <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 mr-auto pl-4">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>La facture A4 sera immédiatement disponible pour le client</span>
                </div>

                <button
                  type="button"
                  disabled={pricingActionLoading}
                  onClick={handleSaveDraftPricing}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Enregistrer brouillon</span>
                </button>

                <button
                  type="button"
                  disabled={pricingActionLoading || hasAnyMissingPrice}
                  onClick={handleValidatePricing}
                  className="px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Calculer &amp; Envoyer la facture au client</span>
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ══ MODALE MODIFICATION PRODUIT & PRIX DE RÉFÉRENCE ══ */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {isEditProductModalOpen && editingProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
        >
          <div className="modal-box w-full max-w-[600px] bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="modal-header flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--primary-tint)' }}
                >
                  <Pencil className="w-4 h-4 text-[var(--primary)]" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Modifier le produit &amp; son prix de référence
                  </h2>
                  <p className="text-xs text-slate-400">Le prix de référence reste strictement privé.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditProductModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editProdError && (
              <div className="mx-6 mt-4 rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2 bg-red-50 text-red-600 border border-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editProdError}</span>
              </div>
            )}

            <form onSubmit={handleEditProductSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom du produit médical *
                </label>
                <input
                  type="text"
                  required
                  value={editProdName}
                  onChange={(e) => setEditProdName(e.target.value)}
                  className="form-input text-xs"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Référence SKU *
                  </label>
                  <input
                    type="text"
                    required
                    value={editProdSku}
                    onChange={(e) => setEditProdSku(e.target.value)}
                    className="form-input text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catégorie
                  </label>
                  <input
                    type="text"
                    value={editProdCat}
                    onChange={(e) => setEditProdCat(e.target.value)}
                    className="form-input text-xs"
                  />
                </div>
              </div>

              {/* Champ Prix de Référence Privé Administrateur */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Prix de référence privé (FCFA) *</span>
                  </label>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Privé Admin
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min="0"
                  step="50"
                  value={editProdPrice}
                  onChange={(e) => setEditProdPrice(e.target.value)}
                  placeholder="ex : 13000"
                  className="w-full px-3 py-2 text-sm font-mono font-bold rounded-xl border border-emerald-300 bg-white text-emerald-950 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-emerald-800 leading-snug">
                  Ce prix est utilisé par défaut lors de la réception des bons de commande. Il ne sera jamais transmis au client.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unité / Conditionnement
                  </label>
                  <input
                    type="text"
                    value={editProdUnit}
                    onChange={(e) => setEditProdUnit(e.target.value)}
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gestion du Stock
                  </label>
                  <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditProductModalOpen(false);
                        setActivePanel('panel-inventory');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                    >
                      <Boxes className="w-3.5 h-3.5" />
                      <span>Gérer dans le module Inventaire</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="edit-prod-active"
                  type="checkbox"
                  checked={editProdActive}
                  onChange={(e) => setEditProdActive(e.target.checked)}
                  className="rounded border-slate-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <label htmlFor="edit-prod-active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Produit actif dans le catalogue public
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs !py-2.5 !px-6"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ MODALE AJOUT PRODUIT ══ */}
      {isAddProductModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
        >
          <div className="modal-box w-full max-w-[650px] bg-white rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="modal-header flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-1">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--primary-tint)' }}
                >
                  <Package className="w-4 h-4 text-[var(--primary)]" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Nouveau produit médical</h2>
                  <p className="text-xs text-slate-400">Le prix de référence sera administrable et privé</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddProductModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-slate-50 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>

            {newProdModalError && (
              <div className="mx-6 mt-4 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2 bg-red-50 text-red-600 border border-red-200">
                <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span>{newProdModalError}</span>
              </div>
            )}

            <form onSubmit={handleAddProductSubmit} className="modal-body p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label text-xs font-semibold text-slate-700 block mb-1">
                    Nom du produit *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="ex : Gants Nitrile Non Poudrés"
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-slate-700 block mb-1">
                    Référence SKU *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value)}
                    placeholder="ex : GLV-NIT-01"
                    className="form-input text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label text-xs font-semibold text-slate-700 block mb-1">
                    Catégorie *
                  </label>
                  <select
                    required
                    value={newProdCat}
                    onChange={(e) => setNewProdCat(e.target.value)}
                    className="form-input text-xs"
                  >
                    <option value="">Sélectionner une catégorie</option>
                    {CATALOG_CATEGORIES.map((cat) => (
                      <option key={cat.slug} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-slate-700 block mb-1">
                    Unité de vente *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProdUnit}
                    onChange={(e) => setNewProdUnit(e.target.value)}
                    placeholder="ex : Boîte, Unité, Pack..."
                    className="form-input text-xs"
                  />
                </div>
              </div>

              {/* Prix de référence privé */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="form-label text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Prix de référence initial (FCFA) *</span>
                  </label>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Privé Admin
                  </span>
                </div>
                <input
                  type="number"
                  required
                  min="0"
                  step="50"
                  value={newProdPrice}
                  onChange={(e) => setNewProdPrice(e.target.value)}
                  placeholder="ex : 2500"
                  className="w-full px-3 py-2 text-sm font-mono font-bold rounded-xl border border-emerald-300 bg-white text-emerald-950 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-emerald-800">
                  Enregistré dans la base de données. Strictement invisible et non transmis aux clients.
                </p>
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-slate-700 block mb-1">
                  Description courte
                </label>
                <textarea
                  rows={2}
                  value={newProdDesc}
                  onChange={(e) => setNewProdDesc(e.target.value)}
                  placeholder="Caractéristiques du dispositif médical"
                  className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs outline-none focus:border-[var(--primary)] focus:bg-white"
                />
              </div>

              <div className="modal-footer flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs !py-2.5 !px-6"
                >
                  Enregistrer le produit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ MODALE DE RELANCE CLIENT B2B (WHATSAPP BUSINESS & PRO EMAIL) ══ */}
      {isRelanceModalOpen && relanceUser && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="modal-box w-full max-w-[620px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="modal-header flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-emerald-600 shadow-sm">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Relance B2B — {relanceUser.establishment_name || relanceUser.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Canaux configurés : WhatsApp Business (+225 07 09 55 40 20) &amp; Email ({relanceUser.email})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRelanceModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 space-y-1">
                <p><strong>Destinataire :</strong> {relanceUser.first_name || ''} {relanceUser.last_name || ''} ({relanceUser.phone || 'Standard direct'})</p>
                <p><strong>Structure :</strong> {relanceUser.establishment_name || 'Établissement'} • {relanceUser.commune || 'Abidjan'}</p>
                {typeof relanceUser.days_since_last_order === 'number' && (
                  <p className="text-rose-700 font-semibold">
                    Dernière commande passée il y a {relanceUser.days_since_last_order} jours (&gt; 60 jours sans réassort).
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Objet du message
                </label>
                <input
                  type="text"
                  value={relanceSubject}
                  onChange={(e) => setRelanceSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 bg-white outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Message personnalisé d'invitation à commander
                </label>
                <textarea
                  rows={8}
                  value={relanceMessage}
                  onChange={(e) => setRelanceMessage(e.target.value)}
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-slate-50 font-sans leading-relaxed outline-none focus:border-[var(--primary)] focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">
                  L'envoi sera consigné dans le journal d'audit et la date sera actualisée.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRelanceModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleSendRelance}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Envoyer la relance</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
