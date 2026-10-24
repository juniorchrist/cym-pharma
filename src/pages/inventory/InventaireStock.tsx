import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Layers,
  TrendingDown,
  RefreshCw,
  Edit2,
  Trash2,
  ArrowDownRight,
  ArrowUpRight,
  SlidersHorizontal,
  FileSpreadsheet,
} from 'lucide-react';
import {
  InventoryItemWithStatus,
  ItemStatus,
  CreateItemPayload,
  UpdateItemPayload,
  CreateMovementPayload,
  InventoryStats,
} from '../../types/inventaire';
import { InventaireService } from '../../services/inventaire';
import { useToast } from '../../context/ToastContext';

interface InventaireStockProps {
  onOpenImport?: () => void;
  onOpenMovements?: () => void;
}

export const InventaireStock: React.FC<InventaireStockProps> = ({ onOpenImport, onOpenMovements }) => {
  const { showToast } = useToast();
  const [items, setItems] = useState<InventoryItemWithStatus[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all');
  const [trackedOnly, setTrackedOnly] = useState<boolean>(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMovementOpen, setIsMovementOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItemWithStatus | null>(null);

  // Create form state
  const [newItemDes, setNewItemDes] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('Unité');
  const [newItemMin, setNewItemMin] = useState('5');
  const [newItemTracked, setNewItemTracked] = useState(true);
  const [newItemOpening, setNewItemOpening] = useState('0');

  // Edit form state
  const [editItemDes, setEditItemDes] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('');
  const [editItemMin, setEditItemMin] = useState('');
  const [editItemTracked, setEditItemTracked] = useState(true);

  // Quick movement form state
  const [mvtType, setMvtType] = useState<'purchase' | 'sale_shop' | 'loss' | 'adjustment'>('purchase');
  const [mvtQty, setMvtQty] = useState('');
  const [mvtReason, setMvtReason] = useState('');

  const loadStats = useCallback(async () => {
    const res = await InventaireService.getStats();
    if (res.success && res.data) {
      setStats(res.data);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const res = await InventaireService.getItems({
      search,
      status: statusFilter,
      is_tracked: trackedOnly ? true : undefined,
      page,
      limit: 25,
    });
    if (res.success && res.data) {
      setItems(res.data.items);
      setTotalPages(res.data.totalPages);
      setTotalCount(res.data.total);
    }
    setLoading(false);
  }, [search, statusFilter, trackedOnly, page]);

  useEffect(() => {
    loadStats();
    loadItems();
  }, [loadStats, loadItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDes.trim()) {
      showToast('Veuillez renseigner la désignation de l\'article', 'error');
      return;
    }

    const payload: CreateItemPayload = {
      designation: newItemDes.trim(),
      unit_label: newItemUnit.trim(),
      min_stock: newItemTracked ? parseInt(newItemMin, 10) || 5 : null,
      is_tracked: newItemTracked,
      opening_qty: parseInt(newItemOpening, 10) || 0,
      opening_reason: 'Création manuelle d\'article',
    };

    const res = await InventaireService.createItem(payload);
    if (res.success) {
      showToast('Article créé avec succès', 'success');
      setIsCreateOpen(false);
      setNewItemDes('');
      setNewItemOpening('0');
      loadStats();
      loadItems();
    } else {
      showToast(res.message || 'Erreur lors de la création', 'error');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const payload: UpdateItemPayload = {
      designation: editItemDes.trim(),
      unit_label: editItemUnit.trim(),
      min_stock: editItemTracked ? parseInt(editItemMin, 10) || null : null,
      is_tracked: editItemTracked,
    };

    const res = await InventaireService.updateItem(selectedItem.id, payload);
    if (res.success) {
      showToast('Article mis à jour', 'success');
      setIsEditOpen(false);
      loadStats();
      loadItems();
    } else {
      showToast(res.message || 'Erreur de mise à jour', 'error');
    }
  };

  const handleQuickMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const qty = parseInt(mvtQty, 10);
    if (!qty || qty <= 0) {
      showToast('Veuillez entrer une quantité valide', 'error');
      return;
    }

    const payload: CreateMovementPayload = {
      item_id: selectedItem.id,
      type: mvtType,
      quantity: qty,
      movement_date: new Date().toISOString().split('T')[0],
      reason: mvtReason.trim() || undefined,
    };

    const res = await InventaireService.createMovement(payload);
    if (res.success) {
      showToast(res.message || 'Mouvement enregistré', 'success');
      setIsMovementOpen(false);
      setMvtQty('');
      setMvtReason('');
      loadStats();
      loadItems();
    } else {
      showToast(res.message || 'Erreur lors du mouvement', 'error');
    }
  };

  const openEditModal = (item: InventoryItemWithStatus) => {
    setSelectedItem(item);
    setEditItemDes(item.designation);
    setEditItemUnit(item.unit_label || 'Unité');
    setEditItemMin(String(item.min_stock ?? 5));
    setEditItemTracked(item.is_tracked);
    setIsEditOpen(true);
  };

  const openMvtModal = (item: InventoryItemWithStatus) => {
    setSelectedItem(item);
    setMvtType('purchase');
    setMvtQty('');
    setMvtReason('');
    setIsMovementOpen(true);
  };

  const getStatusBadge = (status: ItemStatus, qty: number) => {
    switch (status) {
      case 'in_stock':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3 h-3" /> En stock ({qty})
          </span>
        );
      case 'low_stock':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3" /> Stock bas ({qty})
          </span>
        );
      case 'out_of_stock':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <XCircle className="w-3 h-3" /> Rupture (0)
          </span>
        );
      case 'negative':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <AlertTriangle className="w-3 h-3" /> Négatif ({qty})
          </span>
        );
      case 'untracked':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            Non suivi ({qty})
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. CARTOUCHES STATISTIQUES */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => { setStatusFilter('all'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:border-slate-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">Suivis</span>
            <Layers className="w-4 h-4 opacity-75" />
          </div>
          <div className="text-2xl font-bold">{stats?.total_tracked ?? '—'}</div>
          <div className="text-[10px] mt-1 opacity-70">Articles sous surveillance</div>
        </div>

        <div
          onClick={() => { setStatusFilter('in_stock'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'in_stock' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white hover:border-emerald-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">En stock</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">{stats?.in_stock ?? '—'}</div>
          <div className="text-[10px] mt-1 text-slate-500">Quantité &gt; seuil d'alerte</div>
        </div>

        <div
          onClick={() => { setStatusFilter('low_stock'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'low_stock' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white hover:border-amber-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Stock bas</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-700">{stats?.low_stock ?? '—'}</div>
          <div className="text-[10px] mt-1 text-slate-500">À réapprovisionner</div>
        </div>

        <div
          onClick={() => { setStatusFilter('out_of_stock'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'out_of_stock' ? 'bg-red-600 text-white border-red-600' : 'bg-white hover:border-red-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-600">Rupture</span>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-700">{stats?.out_of_stock ?? '—'}</div>
          <div className="text-[10px] mt-1 text-slate-500">Stock à zéro</div>
        </div>

        <div
          onClick={() => { setStatusFilter('negative'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'negative' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white hover:border-purple-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">Négatifs</span>
            <TrendingDown className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-700">{stats?.negative ?? 0}</div>
          <div className="text-[10px] mt-1 text-slate-500">Anomalies classeur</div>
        </div>

        <div
          onClick={() => { setStatusFilter('untracked'); setTrackedOnly(false); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'untracked' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white hover:border-slate-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Hors suivi</span>
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-600">{stats?.untracked ?? '—'}</div>
          <div className="text-[10px] mt-1 text-slate-500">Articles non tracés</div>
        </div>
      </div>

      {/* 2. BARRE D'ACTIONS ET DE FILTRES */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher par désignation ou code (ex: ART-001)..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500 bg-slate-50/50"
            />
          </div>
          <button
            onClick={() => { loadStats(); loadItems(); }}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <input
              type="checkbox"
              checked={trackedOnly}
              onChange={(e) => { setTrackedOnly(e.target.checked); setPage(1); }}
              className="accent-emerald-600 w-3.5 h-3.5 rounded"
            />
            <span>Articles suivis uniquement</span>
          </label>

          {onOpenImport && (
            <button
              onClick={onOpenImport}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Import Excel</span>
            </button>
          )}

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvel Article</span>
          </button>
        </div>
      </div>

      {/* 3. TABLEAU DES ARTICLES */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Catalogue de Stock ({totalCount} articles)
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Page {page} sur {totalPages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Désignation</th>
                <th className="py-3 px-4">Conditionnement</th>
                <th className="py-3 px-4">Stock Actuel</th>
                <th className="py-3 px-4">Seuil Min</th>
                <th className="py-3 px-4">Suivi</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    Chargement des articles de stock...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Aucun article trouvé pour les critères sélectionnés.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-600">
                      {item.code}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-md">
                      {item.designation}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600">
                        {item.unit_label || 'Unité'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(item.status, item.qty_on_hand)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-medium">
                      {item.is_tracked ? (item.min_stock ?? 5) : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.is_tracked ? (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" title="Suivi actif" />
                      ) : (
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300" title="Hors suivi" />
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openMvtModal(item)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition cursor-pointer"
                          title="Enregistrer une entrée ou sortie"
                        >
                          + Mouvement
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="Modifier"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <div>
              Affichage de {items.length} sur {totalCount} articles
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
              >
                Précédent
              </button>
              <span className="px-3 py-1.5 font-bold text-slate-800">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. MODALE DE CRÉATION D'ARTICLE */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                Nouvel Article d'Inventaire
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Désignation complète de l'article *
                </label>
                <input
                  type="text"
                  required
                  value={newItemDes}
                  onChange={(e) => setNewItemDes(e.target.value)}
                  placeholder="ex: COMPRESSE STERILE 40*40 16 PLIS B/100"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Conditionnement / Unité
                  </label>
                  <input
                    type="text"
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    placeholder="ex: Boîte de 100, Flacon 1L, Unité"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Seuil d'alerte (min_stock)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newItemMin}
                    onChange={(e) => setNewItemMin(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Stock initial d'ouverture
                </label>
                <input
                  type="number"
                  min="0"
                  value={newItemOpening}
                  onChange={(e) => setNewItemOpening(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Générera automatiquement un mouvement initial d'ouverture traçable.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">Suivre cet article en stock</div>
                  <div className="text-[10px] text-slate-500">
                    Déclenche les alertes de stock bas et rupture
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={newItemTracked}
                  onChange={(e) => setNewItemTracked(e.target.checked)}
                  className="accent-emerald-600 w-4 h-4 rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition cursor-pointer"
                >
                  Créer l'article
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODALE DE MODIFICATION D'ARTICLE */}
      {isEditOpen && selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-slate-700" />
                Modifier l'Article ({selectedItem.code})
              </h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Désignation de l'article *
                </label>
                <input
                  type="text"
                  required
                  value={editItemDes}
                  onChange={(e) => setEditItemDes(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Conditionnement / Unité
                  </label>
                  <input
                    type="text"
                    value={editItemUnit}
                    onChange={(e) => setEditItemUnit(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Seuil d'alerte (min_stock)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editItemMin}
                    onChange={(e) => setEditItemMin(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">Article suivi en stock</div>
                  <div className="text-[10px] text-slate-500">
                    Stock actuel : <strong className="text-slate-900">{selectedItem.qty_on_hand}</strong>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editItemTracked}
                  onChange={(e) => setEditItemTracked(e.target.checked)}
                  className="accent-emerald-600 w-4 h-4 rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-black rounded-xl shadow-md transition cursor-pointer"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODALE DE MOUVEMENT RAPIDE */}
      {isMovementOpen && selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Enregistrer un Mouvement
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                  {selectedItem.designation}
                </p>
              </div>
              <button
                onClick={() => setIsMovementOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickMovement} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Type d'opération
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMvtType('purchase')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition ${
                      mvtType === 'purchase'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                    <span>Entrée (Achat)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMvtType('sale_shop')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition ${
                      mvtType === 'sale_shop'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-blue-600" />
                    <span>Vente Boutique</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMvtType('loss')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition ${
                      mvtType === 'loss'
                        ? 'bg-red-50 border-red-500 text-red-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span>Perte / Casse</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMvtType('adjustment')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 cursor-pointer transition ${
                      mvtType === 'adjustment'
                        ? 'bg-purple-50 border-purple-500 text-purple-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4 text-purple-600" />
                    <span>Ajustement</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantité ({selectedItem.unit_label || 'unités'}) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={mvtQty}
                  onChange={(e) => setMvtQty(e.target.value)}
                  placeholder="ex: 10"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500 font-bold text-slate-900"
                />
                <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>Stock actuel : <strong>{selectedItem.qty_on_hand}</strong></span>
                  <span>
                    Nouveau stock estimé :{' '}
                    <strong className="text-emerald-700">
                      {mvtType === 'purchase'
                        ? selectedItem.qty_on_hand + (parseInt(mvtQty, 10) || 0)
                        : selectedItem.qty_on_hand - (parseInt(mvtQty, 10) || 0)}
                    </strong>
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motif / Numéro de bon / Justificatif
                </label>
                <input
                  type="text"
                  value={mvtReason}
                  onChange={(e) => setMvtReason(e.target.value)}
                  placeholder="ex: Bon de livraison BL-2026-94, Vente au comptoir..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsMovementOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition cursor-pointer"
                >
                  Valider le mouvement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
