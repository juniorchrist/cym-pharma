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
  Phone,
  Mail,
  MessageSquare,
  RotateCcw,
  Sparkles,
  UserCheck,
  XCircle,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../utils/currency';
import { storage } from '../utils/storage';
import { Admin as AdminApi } from '../services/api';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { Order, Product, User, OrderPricingSummary, PricingLine, RelanceLog, ClientReminder, ReminderTemplate } from '../types';
import { normalizeIvorianPhone, buildWhatsAppLink } from '../utils/phone';
import {
  getLocalReminderTemplates,
  saveLocalReminderTemplates,
  resetLocalReminderTemplates,
  interpolateReminderMessage,
  DEFAULT_REMINDER_TEMPLATES,
} from '../utils/reminderTemplates';
import { CATALOG_CATEGORIES } from '../data/catalog';
import { InventaireIndex } from './inventory';

type AdminPanel = 'panel-overview' | 'panel-products' | 'panel-orders' | 'panel-clients' | 'panel-inventory' | 'panel-templates';

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
  const [userFilterStatus, setUserFilterStatus] = useState<'all' | 'active' | 'inactive' | 'pending'>('all');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const userItemsPerPage = 12;

  // Manual WhatsApp Reminders & Templates State (Rule: 1 relance = 1 client = 1 clic)
  const INACTIVITY_DAYS = 60;
  const REMINDER_COOLDOWN_DAYS = 7;

  const [reminderTemplates, setReminderTemplates] = useState<ReminderTemplate[]>(() => getLocalReminderTemplates());
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('reprise_contact');
  const [relanceUser, setRelanceUser] = useState<User | null>(null);
  const [relanceCustomText, setRelanceCustomText] = useState<string>('');
  const [isRelanceModalOpen, setIsRelanceModalOpen] = useState(false);

  // Real client reminders audit list
  const [clientRemindersList, setClientRemindersList] = useState<ClientReminder[]>([]);
  const [clientRemindersLoading, setClientRemindersLoading] = useState(false);

  // Pending reminder awaiting confirmation on tab return (visibilitychange)
  interface PendingReminder {
    reminderId?: number | string;
    userId: number | string;
    clientName: string;
    structureName: string;
    openedAt: number;
  }
  const [pendingReminder, setPendingReminder] = useState<PendingReminder | null>(() => {
    try {
      const stored = localStorage.getItem('cym_pending_reminder');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() - parsed.openedAt < 24 * 60 * 60 * 1000) return parsed;
      }
    } catch {}
    return null;
  });

  // Phone correction modal state
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [editingPhoneUser, setEditingPhoneUser] = useState<User | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);

  // Template editor tab state
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, string>>({});
  const [savingTemplateKey, setSavingTemplateKey] = useState<string | null>(null);

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

  const loadClientReminders = async () => {
    setClientRemindersLoading(true);
    try {
      const res = await AdminApi.reminders();
      if (res.success && res.data?.reminders) {
        setClientRemindersList(res.data.reminders);
      }
    } catch (err) {
      console.warn('Failed to load reminders from API:', err);
    } finally {
      setClientRemindersLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await AdminApi.reminderTemplates();
      if (res.success && res.data?.templates && res.data.templates.length > 0) {
        setReminderTemplates(res.data.templates);
        saveLocalReminderTemplates(res.data.templates);
      }
    } catch {
      // Local templates already active
    }
  };

  useEffect(() => {
    loadProducts();
    loadOrders();
    loadUsers();
    loadClientReminders();
    loadTemplates();

    // Souscription Supabase Realtime pour actualiser instantanément les commandes dès qu'une commande arrive
    let channel: any = null;
    if (isSupabaseConfigured() && supabase) {
      try {
        channel = supabase
          .channel('admin-orders-realtime')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders' },
            () => {
              loadOrders();
            }
          )
          .subscribe();
      } catch (rtErr) {
        console.warn('[Admin] Realtime subscription notice:', rtErr);
      }
    }

    return () => {
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Détection du retour sur l'onglet pour la barre de confirmation
  useEffect(() => {
    const handleTabReturn = () => {
      if (document.visibilityState === 'visible') {
        try {
          const stored = localStorage.getItem('cym_pending_reminder');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Date.now() - parsed.openedAt < 24 * 60 * 60 * 1000) {
              setPendingReminder(parsed);
            }
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleTabReturn);
    window.addEventListener('focus', handleTabReturn);
    return () => {
      document.removeEventListener('visibilitychange', handleTabReturn);
      window.removeEventListener('focus', handleTabReturn);
    };
  }, []);

  const sectionTitle = {
    'panel-overview': 'Tableau de bord',
    'panel-products': 'Gestion Produits & Prix de Référence (Privé Admin)',
    'panel-orders': 'Chiffrage des Commandes & Facturation',
    'panel-clients': 'Gestion des Utilisateurs & Relances WhatsApp',
    'panel-inventory': 'Gestion de l\'Inventaire & des Stocks (Privé Admin)',
    'panel-templates': 'Modèles de Relance WhatsApp (Textes B2B)',
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

  // ── GESTION HONNÊTE DES RELANCES WHATSAPP & MODÈLES B2B ──

  const isUserInactive = (u: User): boolean => {
    if (u.status === 'inactive') return true;
    if (u.status !== 'active') return false;
    if (u.is_server_inactive === 1 || u.is_server_inactive === true) return true;
    if (typeof u.days_since_last_order === 'number') {
      return u.days_since_last_order >= INACTIVITY_DAYS;
    }
    if (u.last_order_at) {
      const diff = Math.floor((Date.now() - new Date(u.last_order_at).getTime()) / (1000 * 60 * 60 * 24));
      return diff >= INACTIVITY_DAYS;
    }
    if (u.created_at) {
      const diff = Math.floor((Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return diff >= INACTIVITY_DAYS;
    }
    return false;
  };

  /**
   * Clic direct sur "Relancer" :
   * 1. Vérifie le cooldown (< 7 jours).
   * 2. Vérifie la validité du numéro (+225 10 chiffres).
   * 3. window.open(waUrl) appelé IMMÉDIATEMENT de façon synchrone (anti-bloqueur de popup).
   * 4. Enregistre la relance en statut 'opened' auprès de l'API.
   * 5. Active la demande de confirmation au retour sur l'onglet.
   */
  const handleDirectRelance = (user: User) => {
    // 1. Avertissement si relancé il y a moins de 7 jours
    if (user.last_reminder_at || user.last_relance_at) {
      const lastDateStr = user.last_reminder_at || user.last_relance_at!;
      const diffDays = Math.floor((Date.now() - new Date(lastDateStr).getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < REMINDER_COOLDOWN_DAYS) {
        const ok = window.confirm(
          `Client déjà relancé il y a ${diffDays === 0 ? "moins d'un jour" : `${diffDays} jour(s)`}. Souhaitez-vous ouvrir quand même WhatsApp ?`
        );
        if (!ok) return;
      }
    }

    // 2. Normalisation stricte du numéro
    const norm = normalizeIvorianPhone(user.phone);
    if (!norm.isValid || !norm.normalized) {
      showToast(norm.error || 'Numéro invalide ou incomplet. Veuillez le corriger.', 'error');
      handleOpenPhoneModal(user);
      return;
    }

    // 3. Modèle par défaut (reprise_contact)
    const defaultTmpl =
      reminderTemplates.find((t) => t.is_default || t.template_key === 'reprise_contact') ||
      reminderTemplates[0] ||
      DEFAULT_REMINDER_TEMPLATES[0];

    const message = interpolateReminderMessage(defaultTmpl.content, user);
    let waUrl = '';
    try {
      waUrl = buildWhatsAppLink(user.phone!, message);
    } catch (err: any) {
      showToast(err?.message || 'Erreur lors de la génération du lien WhatsApp', 'error');
      return;
    }

    // 4. OUVERTURE SYNCHRONE IMMÉDIATE (Évite tout blocage par le navigateur)
    window.open(waUrl, '_blank', 'noopener');

    // 5. Enregistrer en attente de confirmation
    const clientName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.name || 'Client';
    const structureName = user.establishment_name || user.org || 'Établissement';
    const pending = {
      userId: user.id,
      clientName,
      structureName,
      openedAt: Date.now(),
    };
    setPendingReminder(pending);
    try {
      localStorage.setItem('cym_pending_reminder', JSON.stringify(pending));
    } catch {}

    // 6. Enregistrement asynchrone côté serveur en statut 'opened'
    AdminApi.recordReminder(user.id, defaultTmpl.template_key)
      .then((res) => {
        if (res.success && res.data?.reminder?.id) {
          const withId = { ...pending, reminderId: res.data.reminder.id };
          setPendingReminder(withId);
          try {
            localStorage.setItem('cym_pending_reminder', JSON.stringify(withId));
          } catch {}
        }
        // Mise à jour optimiste de la ligne dans la liste
        setUsersList((prev) =>
          prev.map((u) =>
            u.id === user.id
              ? {
                  ...u,
                  latest_reminder_status: 'opened',
                  latest_reminder_opened_at: new Date().toISOString(),
                  latest_reminder_id: res.data?.reminder?.id,
                }
              : u
          )
        );
        loadClientReminders();
      })
      .catch((err) => {
        console.warn('Trace relance enregistrée localement (backend hors-ligne):', err);
      });

    showToast(
      `Discussion WhatsApp ouverte pour ${structureName}. N'oubliez pas de confirmer l'envoi à votre retour.`,
      'info'
    );
  };

  /**
   * Ouvre la modale pour choisir un autre modèle ou personnaliser le message
   */
  const handleOpenRelanceModal = (user: User) => {
    setRelanceUser(user);
    setSelectedTemplateKey('reprise_contact');

    const defaultTmpl =
      reminderTemplates.find((t) => t.template_key === 'reprise_contact') ||
      reminderTemplates[0] ||
      DEFAULT_REMINDER_TEMPLATES[0];

    setRelanceCustomText(interpolateReminderMessage(defaultTmpl.content, user));
    setIsRelanceModalOpen(true);
  };

  /**
   * Changement de modèle dans la modale
   */
  const handleSelectModalTemplate = (key: string) => {
    setSelectedTemplateKey(key);
    if (!relanceUser) return;
    const tmpl = reminderTemplates.find((t) => t.template_key === key);
    if (tmpl) {
      setRelanceCustomText(interpolateReminderMessage(tmpl.content, relanceUser));
    }
  };

  /**
   * Clic sur "Ouvrir WhatsApp" dans la modale
   */
  const handleModalOpenWhatsApp = () => {
    if (!relanceUser) return;
    if (!relanceCustomText.trim()) {
      showToast('Le message ne peut pas être vide.', 'warning');
      return;
    }

    // Cooldown check
    if (relanceUser.last_reminder_at || relanceUser.last_relance_at) {
      const lastDateStr = relanceUser.last_reminder_at || relanceUser.last_relance_at!;
      const diffDays = Math.floor((Date.now() - new Date(lastDateStr).getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < REMINDER_COOLDOWN_DAYS) {
        const ok = window.confirm(
          `Client déjà relancé il y a ${diffDays === 0 ? "moins d'un jour" : `${diffDays} jour(s)`}. Ouvrir quand même WhatsApp ?`
        );
        if (!ok) return;
      }
    }

    const norm = normalizeIvorianPhone(relanceUser.phone);
    if (!norm.isValid || !norm.normalized) {
      showToast(norm.error || 'Numéro invalide. Veuillez le corriger.', 'error');
      handleOpenPhoneModal(relanceUser);
      return;
    }

    let waUrl = '';
    try {
      waUrl = buildWhatsAppLink(relanceUser.phone!, relanceCustomText);
    } catch (err: any) {
      showToast(err?.message || 'Erreur lors de la génération du lien WhatsApp', 'error');
      return;
    }

    // OUVERTURE SYNCHRONE IMMÉDIATE
    window.open(waUrl, '_blank', 'noopener');
    setIsRelanceModalOpen(false);

    const clientName = [relanceUser.first_name, relanceUser.last_name].filter(Boolean).join(' ') || relanceUser.name || 'Client';
    const structureName = relanceUser.establishment_name || relanceUser.org || 'Établissement';
    const pending = {
      userId: relanceUser.id,
      clientName,
      structureName,
      openedAt: Date.now(),
    };
    setPendingReminder(pending);
    try {
      localStorage.setItem('cym_pending_reminder', JSON.stringify(pending));
    } catch {}

    AdminApi.recordReminder(relanceUser.id, selectedTemplateKey)
      .then((res) => {
        if (res.success && res.data?.reminder?.id) {
          const withId = { ...pending, reminderId: res.data.reminder.id };
          setPendingReminder(withId);
          try {
            localStorage.setItem('cym_pending_reminder', JSON.stringify(withId));
          } catch {}
        }
        setUsersList((prev) =>
          prev.map((u) =>
            u.id === relanceUser.id
              ? {
                  ...u,
                  latest_reminder_status: 'opened',
                  latest_reminder_opened_at: new Date().toISOString(),
                  latest_reminder_id: res.data?.reminder?.id,
                }
              : u
          )
        );
        loadClientReminders();
      })
      .catch(() => {});

    showToast(
      `Discussion WhatsApp ouverte pour ${structureName}. N'oubliez pas de confirmer l'envoi à votre retour.`,
      'info'
    );
  };

  /**
   * Confirmation réelle de la relance (par la barre flottante ou le bouton de ligne)
   */
  const handleConfirmReminder = async (pending: { reminderId?: number | string; userId: number | string; structureName?: string }) => {
    try {
      if (pending.reminderId) {
        await AdminApi.confirmReminder(pending.reminderId);
      }
      setUsersList((prev) =>
        prev.map((u) =>
          String(u.id) === String(pending.userId)
            ? {
                ...u,
                last_reminder_at: new Date().toISOString(),
                latest_reminder_status: 'confirmed',
              }
            : u
        )
      );
      showToast(`Relance WhatsApp confirmée avec succès pour ${pending.structureName || 'le client'}.`, 'success');
    } catch {
      showToast('Relance confirmée localement.', 'success');
    } finally {
      if (pendingReminder && String(pendingReminder.userId) === String(pending.userId)) {
        setPendingReminder(null);
        try {
          localStorage.removeItem('cym_pending_reminder');
        } catch {}
      }
      loadUsers();
      loadClientReminders();
    }
  };

  /**
   * Annulation de la relance (non envoyée ou abandonnée)
   */
  const handleCancelReminder = async (pending: { reminderId?: number | string; userId: number | string }) => {
    try {
      if (pending.reminderId) {
        await AdminApi.cancelReminder(pending.reminderId);
      }
      setUsersList((prev) =>
        prev.map((u) =>
          String(u.id) === String(pending.userId)
            ? { ...u, latest_reminder_status: 'cancelled' }
            : u
        )
      );
      showToast('Relance marquée comme non envoyée / annulée.', 'info');
    } catch {
      showToast('Relance annulée.', 'info');
    } finally {
      if (pendingReminder && String(pendingReminder.userId) === String(pending.userId)) {
        setPendingReminder(null);
        try {
          localStorage.removeItem('cym_pending_reminder');
        } catch {}
      }
      loadUsers();
      loadClientReminders();
    }
  };

  /**
   * Modale de correction rapide du téléphone
   */
  const handleOpenPhoneModal = (user: User) => {
    setEditingPhoneUser(user);
    setPhoneInput(user.phone || '');
    setIsPhoneModalOpen(true);
  };

  const handleSavePhone = async () => {
    if (!editingPhoneUser) return;
    const norm = normalizeIvorianPhone(phoneInput);
    if (!norm.isValid) {
      showToast(norm.error || 'Numéro invalide.', 'error');
      return;
    }

    setPhoneSaving(true);
    try {
      const res = await AdminApi.updateUserPhone(editingPhoneUser.id, phoneInput);
      if (res.success) {
        showToast('Numéro de téléphone mis à jour avec succès.', 'success');
        setUsersList((prev) =>
          prev.map((u) =>
            u.id === editingPhoneUser.id
              ? { ...u, phone: norm.formatted }
              : u
          )
        );
        setIsPhoneModalOpen(false);
      } else {
        showToast(res.message || 'Impossible de mettre à jour le téléphone.', 'error');
      }
    } catch {
      // Mise à jour locale
      setUsersList((prev) =>
        prev.map((u) =>
          u.id === editingPhoneUser.id
            ? { ...u, phone: norm.formatted }
            : u
        )
      );
      showToast('Numéro mis à jour localement.', 'success');
      setIsPhoneModalOpen(false);
    } finally {
      setPhoneSaving(false);
    }
  };

  /**
   * Sauvegarde d'un modèle de message
   */
  const handleSaveTemplate = async (templateKey: string, content: string, title?: string) => {
    setSavingTemplateKey(templateKey);
    try {
      const res = await AdminApi.updateReminderTemplate(templateKey, content, title);
      const updated = reminderTemplates.map((t) =>
        t.template_key === templateKey ? { ...t, content, title: title || t.title } : t
      );
      setReminderTemplates(updated);
      saveLocalReminderTemplates(updated);
      showToast(res.message || 'Modèle de message enregistré avec succès.', 'success');
    } catch {
      const updated = reminderTemplates.map((t) =>
        t.template_key === templateKey ? { ...t, content, title: title || t.title } : t
      );
      setReminderTemplates(updated);
      saveLocalReminderTemplates(updated);
      showToast('Modèle enregistré localement.', 'success');
    } finally {
      setSavingTemplateKey(null);
    }
  };

  /**
   * Rétablir les modèles par défaut officiels CYM Pharma
   */
  const handleResetDefaultTemplates = async () => {
    if (!window.confirm('Rétablir tous les modèles de relance aux textes officiels d\'origine ?')) {
      return;
    }
    try {
      await AdminApi.resetReminderTemplates();
    } catch {}
    const defaults = resetLocalReminderTemplates();
    setReminderTemplates(defaults);
    setTemplateDrafts({});
    showToast('Modèles réinitialisés aux valeurs d\'origine sans emoji.', 'info');
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
      let matchesStatus = true;
      if (userFilterStatus === 'inactive') {
        matchesStatus = isUserInactive(u);
      } else if (userFilterStatus === 'active') {
        matchesStatus = u.status === 'active' && !isUserInactive(u);
      } else if (userFilterStatus === 'pending') {
        matchesStatus = u.status === 'pending';
      }

      const q = (userSearchQuery || globalSearch).toLowerCase().trim();
      const matchesQuery =
        !q ||
        `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.establishment_name && u.establishment_name.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (u.commune && u.commune.toLowerCase().includes(q));

      return matchesStatus && matchesQuery;
    });
  }, [usersList, userFilterStatus, userSearchQuery, globalSearch]);

  const totalUserPages = Math.ceil(filteredUsers.length / userItemsPerPage) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (userCurrentPage - 1) * userItemsPerPage;
    return filteredUsers.slice(start, start + userItemsPerPage);
  }, [filteredUsers, userCurrentPage]);

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

                <button
                  type="button"
                  className={`admin-nav-item ${activePanel === 'panel-templates' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePanel('panel-templates');
                    setSidebarOpen(false);
                  }}
                >
                  <span className="nav-icon-wrap">
                    <FileText className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                  <span>Modèles de relance</span>
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
          {/* BARRE DE CONFIRMATION AU RETOUR SUR L'ONGLET */}
          {pendingReminder && (
            <aside
              aria-label="Confirmation de relance WhatsApp"
              className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-xl border border-blue-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3 duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-400">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-[10.5px] font-extrabold text-blue-200 uppercase tracking-widest">
                      Confirmation de relance requise
                    </p>
                  </div>
                  <p className="text-sm font-bold text-white mt-0.5">
                    Avez-vous envoyé le message WhatsApp à{' '}
                    <span className="text-emerald-300 underline underline-offset-2">
                      {pendingReminder.structureName}
                    </span>{' '}
                    ({pendingReminder.clientName}) ?
                  </p>
                  <p className="text-[11px] text-blue-200/80">
                    Le site ne fait qu'ouvrir WhatsApp : votre confirmation est nécessaire pour actualiser la date de dernière relance.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleConfirmReminder(pendingReminder)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition flex items-center gap-1.5 cursor-pointer shadow-md"
                  aria-label="Oui, relancé"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Oui, relancé</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelReminder(pendingReminder)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-blue-100 hover:text-white transition cursor-pointer"
                  aria-label="Non, relance non envoyée"
                >
                  <span>Non</span>
                </button>
              </div>
            </aside>
          )}

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

          {/* ================= PANEL 4: UTILISATEURS & RELANCES MANUELLES WHATSAPP ================= */}
          {activePanel === 'panel-clients' && (
            <div id="panel-clients" className="panel active space-y-6">
              {/* Honest Module Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-xs font-extrabold uppercase tracking-widest text-blue-200">
                      Relance Manuelle WhatsApp B2B
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold">
                    Supervision des clients inactifs (≥ 60 jours sans commande)
                  </h3>
                  <p className="text-xs text-blue-100 max-w-2xl leading-relaxed">
                    Un clic sur <strong>« Relancer »</strong> ouvre directement la discussion privée WhatsApp de votre client avec le message officiel pré-rempli. Aucun envoi automatique : vous relisez et envoyez depuis votre propre WhatsApp.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      loadUsers();
                      loadClientReminders();
                      showToast('Données utilisateurs et relances actualisées.', 'info');
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-blue-900 hover:bg-blue-50 transition shadow-sm inline-flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Actualiser</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePanel('panel-templates')}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-800/80 hover:bg-blue-700 text-white transition inline-flex items-center gap-1.5 cursor-pointer border border-blue-600/40"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Gérer les modèles</span>
                  </button>
                </div>
              </div>

              {/* 4 KPIs Clients transparents et réels */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Total Clients Inscrits</p>
                  <p className="text-2xl font-bold text-slate-900">{usersList.length}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Comptes enregistrés</p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">E-mails Confirmés</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {usersList.filter((u) => u.is_email_confirmed).length}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">Adresses vérifiées</p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-amber-600 mb-1">En attente de confirmation</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {usersList.filter((u) => !u.is_email_confirmed).length}
                  </p>
                  <p className="text-[11px] text-amber-700 font-medium mt-0.5">E-mail non vérifié</p>
                </div>
                <div className="admin-card p-4">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">En ligne actuellement</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                    <p className="text-2xl font-bold text-slate-700">0</p>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Présence Realtime active</p>
                </div>
              </div>

              {/* Client List Card */}
              <div className="admin-card p-4 sm:p-6 space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Gestion des Comptes Clients &amp; Établissements</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Données réelles synchronisées : confirmation e-mail, dernière connexion, structure et relance WhatsApp
                    </p>
                  </div>

                  {/* Filter Tabs & Search */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => {
                          setUserFilterStatus('all');
                          setUserCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                          userFilterStatus === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Tous ({usersList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUserFilterStatus('active');
                          setUserCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                          userFilterStatus === 'active'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Confirmés ({usersList.filter((u) => u.is_email_confirmed).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUserFilterStatus('inactive');
                          setUserCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                          userFilterStatus === 'inactive'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-rose-700 hover:bg-rose-50'
                        }`}
                      >
                        Inactifs ({usersList.filter((u) => isUserInactive(u)).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUserFilterStatus('pending');
                          setUserCurrentPage(1);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                          userFilterStatus === 'pending'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Non confirmés ({usersList.filter((u) => !u.is_email_confirmed).length})
                      </button>
                    </div>

                    <div className="relative min-w-[200px]">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={userSearchQuery}
                        onChange={(e) => {
                          setUserSearchQuery(e.target.value);
                          setUserCurrentPage(1);
                        }}
                        placeholder="Filtrer client, officine, ville..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>
                </div>

                {/* Empty State */}
                {filteredUsers.length === 0 ? (
                  <div className="py-12 text-center space-y-2 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-sm font-bold text-slate-700">
                      {userFilterStatus === 'inactive'
                        ? 'Aucun client inactif'
                        : 'Aucun utilisateur trouvé'}
                    </p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      {userFilterStatus === 'inactive'
                        ? 'Tous vos clients actifs ont passé commande au cours des 60 derniers jours.'
                        : 'Aucun compte ne correspond à vos critères de recherche actuels.'}
                    </p>
                    {userFilterStatus !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setUserFilterStatus('all');
                          setUserSearchQuery('');
                        }}
                        className="mt-2 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:underline cursor-pointer"
                      >
                        Réinitialiser les filtres
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View (≥ 768px) */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[10px]">
                            <th className="pb-3 font-semibold">Responsable &amp; Contact</th>
                            <th className="pb-3 font-semibold">Structure &amp; Rôle</th>
                            <th className="pb-3 font-semibold">Création &amp; Dernière Connexion</th>
                            <th className="pb-3 font-semibold">Confirmation E-mail</th>
                            <th className="pb-3 font-semibold">Dernière Relance</th>
                            <th className="pb-3 font-semibold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody id="u-table-body" className="divide-y divide-slate-100">
                          {paginatedUsers.map((u) => {
                            const inactive = isUserInactive(u);
                            const phoneCheck = normalizeIvorianPhone(u.phone);
                            const createdDateStr = u.created_at
                              ? new Date(u.created_at).toLocaleDateString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })
                              : 'Date inconnue';
                            const lastLoginStr = u.last_sign_in_at || u.last_login_at
                              ? new Date(u.last_sign_in_at || u.last_login_at || '').toLocaleDateString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Jamais connecté';

                            const clientFullName =
                              u.name ||
                              [u.first_name, u.last_name].filter(Boolean).join(' ') ||
                              'Responsable non spécifié';

                            return (
                              <tr key={u.id} className="hover:bg-slate-50 transition">
                                <td className="py-3">
                                  <p className="font-bold text-slate-900">{clientFullName}</p>
                                  <p className="text-[11px] text-slate-500 font-mono">{u.email}</p>
                                  <div className="mt-1 flex items-center gap-1.5">
                                    {phoneCheck.isValid ? (
                                      <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        <span>{phoneCheck.formatted}</span>
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 inline-flex items-center gap-1">
                                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                        <span>{u.phone || 'Téléphone manquant'}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenPhoneModal(u)}
                                          className="underline text-[10px] font-bold text-rose-700 hover:text-rose-900 ml-1 cursor-pointer"
                                        >
                                          Corriger
                                        </button>
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-3">
                                  <p className="font-semibold text-slate-800">{u.establishment_name || u.org || 'Structure non renseignée'}</p>
                                  <p className="text-[11px] text-slate-400">
                                    {u.commune || 'Abidjan'} • <span className="uppercase font-mono text-[10px] font-semibold text-slate-500">{u.role || 'client'}</span>
                                  </p>
                                </td>

                                <td className="py-3">
                                  <div className="space-y-0.5">
                                    <p className="text-[11px] text-slate-700">
                                      <span className="text-slate-400">Inscrit le : </span>
                                      <span className="font-semibold">{createdDateStr}</span>
                                    </p>
                                    <p className="text-[11px] text-slate-600">
                                      <span className="text-slate-400">Connexion : </span>
                                      <span className={u.last_sign_in_at ? 'font-medium text-slate-700' : 'text-slate-400 italic'}>
                                        {lastLoginStr}
                                      </span>
                                    </p>
                                  </div>
                                </td>

                                <td className="py-3">
                                  <div className="space-y-1">
                                    {u.is_email_confirmed ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        <span>E-mail confirmé</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                        <Clock className="w-3 h-3 text-amber-600" />
                                        <span>Non confirmé</span>
                                      </span>
                                    )}
                                    {inactive && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 block w-max">
                                        Inactif (≥ 60j)
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-3">
                                  {/* Statuts honnêtes uniquement : Relancé, Ouvert — à confirmer, Annulé */}
                                  {u.latest_reminder_status === 'opened' ? (
                                    <div className="space-y-1">
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                                        <Clock className="w-3 h-3 text-amber-600 animate-spin" />
                                        <span>Ouvert — à confirmer</span>
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleConfirmReminder({
                                              reminderId: u.latest_reminder_id,
                                              userId: u.id,
                                              structureName: u.establishment_name || u.name,
                                            })
                                          }
                                          className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition cursor-pointer"
                                        >
                                          ✓ Confirmer
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleCancelReminder({
                                              reminderId: u.latest_reminder_id,
                                              userId: u.id,
                                            })
                                          }
                                          className="text-[9.5px] font-semibold text-slate-600 hover:text-slate-900 px-1.5 py-0.5 rounded cursor-pointer"
                                        >
                                          ✕ Annuler
                                        </button>
                                      </div>
                                    </div>
                                  ) : u.latest_reminder_status === 'confirmed' || u.last_reminder_at ? (
                                    <div className="space-y-0.5">
                                      <span className="text-[10.5px] font-bold text-slate-800 block">
                                        {new Date(u.last_reminder_at || Date.now()).toLocaleDateString('fr-FR', {
                                          day: '2-digit',
                                          month: 'short',
                                          year: 'numeric',
                                        })}
                                      </span>
                                      <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                        <span>Relancé</span>
                                      </span>
                                    </div>
                                  ) : u.latest_reminder_status === 'cancelled' ? (
                                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                      Annulé
                                    </span>
                                  ) : inactive ? (
                                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                      À relancer
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">Non requis</span>
                                  )}
                                </td>

                                <td className="py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Bouton principal "Relancer" (ouvre directement WhatsApp avec modèle par défaut) */}
                                    <button
                                      type="button"
                                      disabled={!phoneCheck.isValid}
                                      onClick={() => handleDirectRelance(u)}
                                      className={`min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                                        phoneCheck.isValid
                                          ? 'text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                                          : 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed opacity-60'
                                      }`}
                                      title={
                                        phoneCheck.isValid
                                          ? 'Ouvrir directement WhatsApp avec le modèle par défaut'
                                          : 'Numéro invalide ou incomplet'
                                      }
                                      aria-label={
                                        phoneCheck.isValid
                                          ? `Relancer ${u.establishment_name || u.name} sur WhatsApp`
                                          : 'Numéro invalide ou incomplet'
                                      }
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      <span>Relancer</span>
                                    </button>

                                    {/* Bouton discret "Modifier le message" (ouvre la modale de personnalisation) */}
                                    <button
                                      type="button"
                                      onClick={() => handleOpenRelanceModal(u)}
                                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                                      title="Choisir un autre modèle ou modifier le message avant d'ouvrir WhatsApp"
                                      aria-label="Modifier le message"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Statut utilisateur */}
                                    <select
                                      value={u.status}
                                      onChange={(e) => handleUpdateUserStatus(u.id, e.target.value)}
                                      className="text-[11px] font-semibold py-1.5 px-2 rounded-xl border border-slate-200 bg-white cursor-pointer"
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

                    {/* Mobile & Tablet Card View (< 768px) */}
                    <div className="md:hidden space-y-3">
                      {paginatedUsers.map((u) => {
                        const inactive = isUserInactive(u);
                        const phoneCheck = normalizeIvorianPhone(u.phone);
                        const daysAgo =
                          typeof u.days_since_last_order === 'number'
                            ? u.days_since_last_order
                            : u.last_order_at
                            ? Math.floor((Date.now() - new Date(u.last_order_at).getTime()) / (1000 * 60 * 60 * 24))
                            : null;

                        return (
                          <div
                            key={u.id}
                            className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-bold text-slate-900 text-sm">
                                  {u.first_name || ''} {u.last_name || ''}
                                </p>
                                <p className="text-xs font-semibold text-slate-700">
                                  {u.establishment_name || 'Sans structure'}
                                </p>
                                <p className="text-[11px] text-slate-400">{u.commune || 'Abidjan'}</p>
                              </div>

                              <div>
                                {inactive ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    Inactif
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Actif
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Téléphone :</span>
                                {phoneCheck.isValid ? (
                                  <span className="font-semibold text-slate-800">{phoneCheck.formatted}</span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-rose-600 font-semibold">{u.phone || 'Non renseigné'}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenPhoneModal(u)}
                                      className="text-rose-700 underline font-bold"
                                    >
                                      Corriger
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Dernière commande :</span>
                                <span className="font-semibold text-slate-800">
                                  {daysAgo !== null ? `Il y a ${daysAgo} jours` : 'Aucune'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Dernière relance :</span>
                                <span className="font-semibold text-slate-800">
                                  {u.latest_reminder_status === 'opened'
                                    ? 'Ouvert — à confirmer'
                                    : u.latest_reminder_status === 'confirmed' || u.last_reminder_at
                                    ? 'Relancé'
                                    : inactive
                                    ? 'À relancer'
                                    : 'Non requis'}
                                </span>
                              </div>
                            </div>

                            {/* Mobile Actions (Buttons ≥ 44px) */}
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={!phoneCheck.isValid}
                                onClick={() => handleDirectRelance(u)}
                                className={`flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                                  phoneCheck.isValid
                                    ? 'text-white bg-emerald-600 hover:bg-emerald-700'
                                    : 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed opacity-60'
                                }`}
                                aria-label="Relancer sur WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                                <span>Relancer</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenRelanceModal(u)}
                                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                                aria-label="Modifier le message"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination */}
                    {totalUserPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs">
                        <span className="text-slate-500">
                          Affichage de {(userCurrentPage - 1) * userItemsPerPage + 1} à{' '}
                          {Math.min(userCurrentPage * userItemsPerPage, filteredUsers.length)} sur{' '}
                          {filteredUsers.length} comptes
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={userCurrentPage === 1}
                            onClick={() => setUserCurrentPage((p) => Math.max(1, p - 1))}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Précédent
                          </button>
                          <span className="px-3 py-1.5 font-bold text-slate-800">
                            {userCurrentPage} / {totalUserPages}
                          </span>
                          <button
                            type="button"
                            disabled={userCurrentPage === totalUserPages}
                            onClick={() => setUserCurrentPage((p) => Math.min(totalUserPages, p + 1))}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Suivant
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Real Audit Trail Table of Manual WhatsApp Relances */}
              <div className="admin-card p-6">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Journal de traçabilité des relances manuelles WhatsApp (wa.me)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Statuts stricts : « Ouvert — à confirmer », « Relancé » (validé par l'admin), « Annulé ». Aucun faux statut.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {clientRemindersList.length} relance(s) tracée(s)
                  </span>
                </div>

                {clientRemindersList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-6 text-center">
                    Aucune relance effectuée pour le moment. Cliquez sur « Relancer » pour ouvrir une discussion client.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px] tracking-wider">
                          <th className="pb-2.5 font-semibold">Date &amp; Heure</th>
                          <th className="pb-2.5 font-semibold">Client / Établissement</th>
                          <th className="pb-2.5 font-semibold">Modèle utilisé</th>
                          <th className="pb-2.5 font-semibold">Statut réel</th>
                          <th className="pb-2.5 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clientRemindersList.map((rem) => {
                          const tmpl = reminderTemplates.find((t) => t.template_key === rem.template_key);
                          const tmplTitle = tmpl?.title || rem.template_key;

                          return (
                            <tr key={rem.id} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 text-slate-600 font-medium">
                                {new Date(rem.opened_at).toLocaleString('fr-FR', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </td>
                              <td className="py-2.5">
                                <p className="font-bold text-slate-900">{rem.establishment_name || 'Établissement'}</p>
                                <p className="text-[10.5px] text-slate-500">
                                  {[rem.first_name, rem.last_name].filter(Boolean).join(' ') || rem.name} • {rem.phone}
                                </p>
                              </td>
                              <td className="py-2.5">
                                <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {tmplTitle}
                                </span>
                              </td>
                              <td className="py-2.5">
                                {rem.status === 'confirmed' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Relancé (confirmé)</span>
                                  </span>
                                ) : rem.status === 'opened' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                                    <Clock className="w-3 h-3 text-amber-600 animate-spin" />
                                    <span>Ouvert — à confirmer</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                    <XCircle className="w-3 h-3" />
                                    <span>Annulé</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 text-right">
                                {rem.status === 'opened' && (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleConfirmReminder({
                                          reminderId: rem.id,
                                          userId: rem.user_id,
                                          structureName: rem.establishment_name,
                                        })
                                      }
                                      className="px-2.5 py-1 text-[10.5px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer"
                                    >
                                      ✓ Confirmer
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCancelReminder({
                                          reminderId: rem.id,
                                          userId: rem.user_id,
                                        })
                                      }
                                      className="px-2 py-1 text-[10.5px] font-semibold rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                                    >
                                      ✕ Annuler
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= PANEL: MODÈLES DE RELANCE WHATSAPP (TEXTES B2B) ================= */}
          {activePanel === 'panel-templates' && (
            <div id="panel-templates" className="panel active space-y-6">
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Modèles Officiels de Relance WhatsApp B2B
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                    Textes bruts <strong>sans emoji</strong> stockés côté serveur. Les variables{' '}
                    <code className="text-blue-700 bg-blue-50 px-1 py-0.5 rounded font-mono text-[11px]">&#123;responsable&#125;</code>{' '}
                    et{' '}
                    <code className="text-blue-700 bg-blue-50 px-1 py-0.5 rounded font-mono text-[11px]">&#123;structure&#125;</code>{' '}
                    sont automatiquement remplacées par les coordonnées réelles du client avant l'ouverture de WhatsApp.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetDefaultTemplates}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rétablir les modèles par défaut</span>
                </button>
              </div>

              {/* Grille des 4 Modèles */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {reminderTemplates.map((tmpl, idx) => {
                  const draftContent = templateDrafts[tmpl.template_key] ?? tmpl.content;
                  const isModified = draftContent !== tmpl.content;
                  const isSaving = savingTemplateKey === tmpl.template_key;
                  const previewInterp = interpolateReminderMessage(draftContent, {
                    first_name: 'Dr',
                    last_name: 'Konan',
                    establishment_name: 'Pharmacie de la Grâce',
                  });

                  return (
                    <div
                      key={tmpl.template_key}
                      className="admin-card p-5 space-y-4 border border-slate-200 bg-white shadow-xs"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 text-[var(--primary)] flex items-center justify-center font-bold text-xs">
                            {idx + 1}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                              <span>{tmpl.title}</span>
                              {tmpl.is_default ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  Modèle par défaut
                                </span>
                              ) : null}
                            </h3>
                            <span className="text-[10px] text-slate-400 font-mono">
                              clé : {tmpl.template_key}
                            </span>
                          </div>
                        </div>

                        {tmpl.template_key === 'nouveautes' && (
                          <span className="text-[10.5px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-600" />
                            <span>Contrôle requis</span>
                          </span>
                        )}
                      </div>

                      {tmpl.warning_note && (
                        <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <p className="text-[11px] leading-relaxed">
                            <strong>Consigne commerciale :</strong> {tmpl.warning_note}
                          </p>
                        </div>
                      )}

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1.5">
                          Texte du message brut (modèle)
                        </label>
                        <textarea
                          rows={4}
                          value={draftContent}
                          onChange={(e) =>
                            setTemplateDrafts((prev) => ({
                              ...prev,
                              [tmpl.template_key]: e.target.value,
                            }))
                          }
                          className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-slate-50/50 font-sans leading-relaxed outline-none focus:border-[var(--primary)] focus:bg-white transition"
                        />
                        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                          <span>Variables : &#123;responsable&#125;, &#123;structure&#125;</span>
                          <span className={draftContent.length > 900 ? 'text-amber-600 font-bold' : ''}>
                            {draftContent.length} / ~1000 car.
                          </span>
                        </div>
                      </div>

                      {/* Aperçu en direct */}
                      <div className="p-3 rounded-xl bg-emerald-50/40 border border-emerald-100 space-y-1">
                        <p className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                          Aperçu avec données client réelles :
                        </p>
                        <p className="text-xs text-slate-800 italic leading-relaxed">
                          « {previewInterp} »
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        {isModified && (
                          <button
                            type="button"
                            onClick={() =>
                              setTemplateDrafts((prev) => ({
                                ...prev,
                                [tmpl.template_key]: tmpl.content,
                              }))
                            }
                            className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                          >
                            Rétablir
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!isModified || isSaving}
                          onClick={() => handleSaveTemplate(tmpl.template_key, draftContent, tmpl.title)}
                          className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-white bg-[var(--primary)] hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSaving ? 'Enregistrement…' : 'Enregistrer'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
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

      {/* ══ MODALE DE RELANCE WHATSAPP B2B (HONNÊTE SANS FAUX SUCCÈS) ══ */}
      {isRelanceModalOpen && relanceUser && (() => {
        const norm = normalizeIvorianPhone(relanceUser.phone);
        const structureName = relanceUser.establishment_name || relanceUser.org || 'Établissement';
        const contactName = [relanceUser.first_name, relanceUser.last_name].filter(Boolean).join(' ') || relanceUser.name || 'Responsable';

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="relance-modal-title"
            className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          >
            <div className="modal-box w-full max-w-[640px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="modal-header flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white bg-emerald-600 shadow-sm">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 id="relance-modal-title" className="text-base font-bold text-slate-900">
                      Relancer {structureName}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Discussion WhatsApp privée • {norm.isValid ? norm.formatted : 'Numéro à vérifier'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRelanceModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-slate-100 text-slate-500 cursor-pointer"
                  aria-label="Fermer la modale"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Corps défilable */}
              <div className="p-5 space-y-4 overflow-y-auto">
                {/* Récapitulatif Client */}
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 space-y-1">
                  <p>
                    <strong>Responsable :</strong> {contactName} • <strong>Structure :</strong> {structureName}
                  </p>
                  {typeof relanceUser.days_since_last_order === 'number' && (
                    <p className="text-rose-700 font-semibold">
                      Dernière commande passée il y a {relanceUser.days_since_last_order} jours (&ge; 60 jours sans réassort).
                    </p>
                  )}
                  {/* Alerte si relancé il y a moins de 7 jours */}
                  {relanceUser.last_reminder_at && (() => {
                    const diffDays = Math.floor((Date.now() - new Date(relanceUser.last_reminder_at).getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays < REMINDER_COOLDOWN_DAYS) {
                      return (
                        <p className="text-amber-800 font-bold flex items-center gap-1 pt-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Ce client a déjà été relancé il y a {diffDays === 0 ? "moins d'un jour" : `${diffDays} jour(s)`}.</span>
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Sélecteur de Modèles (Lucide icons uniquement, zéro emoji) */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-2">
                    Choisir un modèle de message
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {reminderTemplates.map((tmpl) => {
                      const isSelected = selectedTemplateKey === tmpl.template_key;
                      const getIcon = () => {
                        switch (tmpl.template_key) {
                          case 'reprise_contact':
                            return <RotateCcw className="w-3.5 h-3.5" />;
                          case 'reappro':
                            return <Boxes className="w-3.5 h-3.5" />;
                          case 'espace_client':
                            return <UserCheck className="w-3.5 h-3.5" />;
                          case 'nouveautes':
                            return <Sparkles className="w-3.5 h-3.5" />;
                          default:
                            return <MessageSquare className="w-3.5 h-3.5" />;
                        }
                      };

                      return (
                        <button
                          key={tmpl.template_key}
                          type="button"
                          onClick={() => handleSelectModalTemplate(tmpl.template_key)}
                          className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex items-center gap-2 ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold shadow-xs'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium'
                          }`}
                        >
                          <span className={isSelected ? 'text-emerald-700' : 'text-slate-400'}>
                            {getIcon()}
                          </span>
                          <span className="truncate">{tmpl.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Avertissement déontologique pour le modèle 4 */}
                {selectedTemplateKey === 'nouveautes' && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11.5px] leading-relaxed">
                      <strong>Rappel déontologique :</strong> Ce modèle ne doit être utilisé que si de nouvelles références réelles ont été récemment ajoutées au catalogue de CYM Pharma.
                    </p>
                  </div>
                )}

                {/* Champ texte modifiable */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Texte du message (variables déjà personnalisées)
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        relanceCustomText.length > 900 ? 'text-amber-600 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {relanceCustomText.length} / ~1000 caractères
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={relanceCustomText}
                    onChange={(e) => setRelanceCustomText(e.target.value)}
                    className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white font-sans leading-relaxed outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition"
                  />
                </div>

                {/* Aperçu bulle WhatsApp */}
                <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-1.5">
                  <p className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">
                    Aperçu dans la discussion WhatsApp :
                  </p>
                  <div className="bg-[#DCF8C6] p-3 rounded-xl rounded-tr-none text-slate-800 text-xs leading-relaxed shadow-xs max-w-[90%] ml-auto border border-emerald-200">
                    <p className="whitespace-pre-wrap">{relanceCustomText}</p>
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-500">
                      <span>{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      <CheckCheck className="w-3 h-3 text-blue-500" />
                    </div>
                  </div>
                </div>

                {/* Canaux de repli */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[11px] text-slate-500">
                    En cas de repli si WhatsApp est indisponible :
                  </span>
                  <div className="flex items-center gap-2">
                    {relanceUser.phone && (
                      <a
                        href={`tel:${relanceUser.phone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold transition"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>Appeler ({relanceUser.phone})</span>
                      </a>
                    )}
                    {relanceUser.email && (
                      <a
                        href={`mailto:${relanceUser.email}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold transition"
                      >
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span>E-mail direct</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
                <span className="text-[11px] text-slate-500 italic">
                  Ouvre WhatsApp dans un nouvel onglet sans envoi automatique.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRelanceModalOpen(false)}
                    className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-white text-slate-700 transition cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleModalOpenWhatsApp}
                    className="min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Ouvrir WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ MODALE DE CORRECTION DU TÉLÉPHONE CLIENT ══ */}
      {isPhoneModalOpen && editingPhoneUser && (() => {
        const norm = normalizeIvorianPhone(phoneInput);
        const structure = editingPhoneUser.establishment_name || editingPhoneUser.name || 'Client';

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-modal-title"
            className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          >
            <div className="modal-box w-full max-w-[480px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
              <div className="modal-header flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--primary)] bg-blue-50">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 id="phone-modal-title" className="text-sm font-bold text-slate-900">
                      Corriger le téléphone
                    </h2>
                    <p className="text-xs text-slate-500 truncate max-w-[280px]">
                      {structure}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPhoneModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-slate-100 text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Numéro de téléphone Côte d'Ivoire (10 chiffres)
                  </label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="ex : +225 07 07 07 97 46"
                    className="w-full px-3.5 py-2.5 text-xs font-mono font-medium rounded-xl border border-slate-200 bg-white outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Accepte les formats +225, 00225, 0707079746, espaces et tirets.
                  </p>
                </div>

                {/* Résultat de la validation en direct */}
                {phoneInput.trim() ? (
                  norm.isValid ? (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-bold">Numéro valide pour WhatsApp</p>
                        <p className="font-mono text-[11px] text-emerald-700">{norm.formatted}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="text-[11.5px] leading-relaxed">
                        <p className="font-bold">{norm.error || 'Numéro invalide'}</p>
                        {phoneInput.trim().replace(/[\s\-\.\(\)\/+]/g, '').replace(/^(00)?225/, '').length === 8 && (
                          <p className="mt-1 text-rose-700">
                            La Côte d'Ivoire est passée au plan national à 10 chiffres en 2021. Le préfixe opérateur (01, 05 ou 07) ne pouvant pas être deviné automatiquement, veuillez saisir les 10 chiffres complets.
                          </p>
                        )}
                      </div>
                    </div>
                  )
                ) : null}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPhoneModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:bg-white text-slate-700 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={!norm.isValid || phoneSaving}
                  onClick={handleSavePhone}
                  className="min-h-[44px] px-5 py-2 rounded-xl text-xs font-bold text-white bg-[var(--primary)] hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{phoneSaving ? 'Enregistrement…' : 'Enregistrer le numéro'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
