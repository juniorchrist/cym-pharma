import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingDown,
  RefreshCw,
  FileSpreadsheet,
  PackageCheck,
  HelpCircle,
  Boxes,
} from 'lucide-react';
import {
  InventoryItemWithStatus,
  ItemStatus,
  InventoryStats,
} from '../../types/inventaire';
import { InventaireService } from '../../services/inventaire';
import { useToast } from '../../context/ToastContext';

interface InventaireStockProps {
  onOpenImport?: () => void;
}

export const InventaireStock: React.FC<InventaireStockProps> = ({ onOpenImport }) => {
  const { showToast } = useToast();
  const [items, setItems] = useState<InventoryItemWithStatus[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ItemStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadStats = useCallback(async () => {
    const res = await InventaireService.getStats();
    if (res.success && res.data) {
      setStats(res.data);
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await InventaireService.getItems({
      search,
      status: statusFilter,
      page,
      limit: 25,
    });
    if (res.success && res.data) {
      setItems(res.data.items);
      setTotalPages(res.data.totalPages);
      setTotalCount(res.data.total);
    } else {
      setError(res.message || 'Impossible de contacter le serveur CYM Pharma pour charger les articles.');
    }
    setLoading(false);
  }, [search, statusFilter, page]);

  useEffect(() => {
    loadStats();
    loadItems();
  }, [loadStats, loadItems]);

  const getStatusBadge = (status: ItemStatus, qty: number | null) => {
    switch (status) {
      case 'in_stock':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3 h-3 text-emerald-500" /> En stock
          </span>
        );
      case 'low_stock':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-500" /> Stock bas
          </span>
        );
      case 'out_of_stock':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <XCircle className="w-3 h-3 text-red-500" /> Rupture
          </span>
        );
      case 'negative':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <TrendingDown className="w-3 h-3 text-purple-500" /> Négatif
          </span>
        );
      case 'unrecorded':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
            <HelpCircle className="w-3 h-3 text-slate-400" /> Non renseigné
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. CARTOUCHES STATISTIQUES (5 INDICATEURS STRICTEMENT MUTUELLEMENT EXCLUSIFS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total des articles */}
        <div
          onClick={() => { setStatusFilter('all'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900'
              : 'bg-white hover:border-slate-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">Total Articles</span>
            <Boxes className="w-4 h-4 opacity-75" />
          </div>
          <div className="text-2xl font-bold">{stats?.total_items ?? '—'}</div>
          <div className="text-[10px] mt-1 opacity-70">Produits du catalogue</div>
        </div>

        {/* En stock */}
        <div
          onClick={() => { setStatusFilter('in_stock'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'in_stock'
              ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-600'
              : 'bg-white hover:border-emerald-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">En stock</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">{stats?.in_stock ?? '—'}</div>
          <div className="text-[10px] mt-1 text-slate-500">Quantité &gt; seuil</div>
        </div>

        {/* Stock bas */}
        <div
          onClick={() => { setStatusFilter('low_stock'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'low_stock'
              ? 'bg-amber-500 text-white border-amber-500 ring-2 ring-amber-500'
              : 'bg-white hover:border-amber-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Stock bas</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-700">{stats?.low_stock ?? '—'}</div>
          <div className="text-[10px] mt-1 text-slate-500">À réapprovisionner</div>
        </div>

        {/* Rupture */}
        <div
          onClick={() => { setStatusFilter('out_of_stock'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'out_of_stock'
              ? 'bg-red-600 text-white border-red-600 ring-2 ring-red-600'
              : 'bg-white hover:border-red-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-600">Rupture</span>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-700">{stats?.out_of_stock ?? '—'}</div>
          <div className="text-[10px] mt-1 text-slate-500">Quantité = 0</div>
        </div>

        {/* Négatifs */}
        <div
          onClick={() => { setStatusFilter('negative'); setPage(1); }}
          className={`cursor-pointer p-4 rounded-2xl border transition shadow-sm ${
            statusFilter === 'negative'
              ? 'bg-purple-600 text-white border-purple-600 ring-2 ring-purple-600'
              : 'bg-white hover:border-purple-300 text-slate-800 border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">Négatifs</span>
            <TrendingDown className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-700">{stats?.negative ?? 0}</div>
          <div className="text-[10px] mt-1 text-slate-500">Quantité &lt; 0 (à vérifier)</div>
        </div>
      </div>

      {/* 2. BARRE D'ACTIONS, RECHERCHE ET FILTRES */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher par référence, désignation, catégorie (ex: CMD-ABL, GANTS)..."
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
          {/* Filtre par statut */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none cursor-pointer"
          >
            <option value="all">Tous les états de stock</option>
            <option value="in_stock">En stock</option>
            <option value="low_stock">Stock bas</option>
            <option value="out_of_stock">Rupture (0)</option>
            <option value="negative">Stock négatif</option>
            <option value="unrecorded">Stock non renseigné</option>
          </select>

          {onOpenImport && (
            <button
              onClick={onOpenImport}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Importer un fichier Excel</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. TABLEAU PRINCIPAL DE CONSULTATION DU STOCK */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-emerald-600" />
            <span>Catalogue de Stock ({totalCount} produit{totalCount > 1 ? 's' : ''})</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            Page {page} sur {totalPages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4 w-32">Référence</th>
                <th className="py-3 px-4">Désignation du Produit</th>
                <th className="py-3 px-4 w-36">Conditionnement</th>
                <th className="py-3 px-4 text-center w-32">Stock Actuel</th>
                <th className="py-3 px-4 text-center w-28">Seuil Min</th>
                <th className="py-3 px-4 text-center w-36">État</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                    <td className="py-4 px-4">
                      <div className="h-4 bg-slate-200 rounded w-56 mb-1" />
                      <div className="h-3 bg-slate-100 rounded w-24" />
                    </td>
                    <td className="py-4 px-4"><div className="h-4 bg-slate-200 rounded w-24" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-5 bg-slate-200 rounded w-16 mx-auto" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-4 bg-slate-200 rounded w-10 mx-auto" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-5 bg-slate-200 rounded w-20 mx-auto" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center">
                    <div className="max-w-md mx-auto p-6 rounded-2xl bg-red-50 border border-red-200 text-red-800 space-y-3">
                      <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
                      <p className="font-bold text-sm">Échec du chargement des stocks</p>
                      <p className="text-xs text-red-600">{error}</p>
                      <button
                        type="button"
                        onClick={() => { loadStats(); loadItems(); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Réessayer</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3 text-slate-500">
                      <div className="w-14 h-14 rounded-3xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <FileSpreadsheet className="w-7 h-7" />
                      </div>
                      <p className="font-extrabold text-base text-slate-800">
                        {totalCount === 0 && !search && statusFilter === 'all'
                          ? "Aucun article dans le catalogue"
                          : "Aucun article ne correspond aux filtres appliqués"}
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {totalCount === 0 && !search && statusFilter === 'all'
                          ? "Votre catalogue est vide. Importez un classeur Excel pour renseigner les stocks."
                          : "Modifiez votre recherche ou réinitialisez le filtre d'état."}
                      </p>
                      {onOpenImport && (
                        <button
                          type="button"
                          onClick={onOpenImport}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition cursor-pointer shadow-sm mt-2"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Importer un fichier Excel</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const hasQty = item.qty_on_hand !== null && item.qty_on_hand !== undefined;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      {/* Référence */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                        {item.code || '—'}
                      </td>

                      {/* Désignation & Catégorie */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 leading-tight">
                          {item.designation}
                        </div>
                        {item.category && item.category !== '—' && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.category}
                          </div>
                        )}
                      </td>

                      {/* Conditionnement */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                          {item.unit_label || 'Unité'}
                        </span>
                      </td>

                      {/* Stock Actuel */}
                      <td className="py-3.5 px-4 text-center">
                        {hasQty ? (
                          <span
                            className={`font-mono font-bold text-sm ${
                              item.qty_on_hand! < 0
                                ? 'text-purple-700'
                                : item.qty_on_hand === 0
                                ? 'text-red-600'
                                : item.min_stock != null && item.qty_on_hand! <= item.min_stock
                                ? 'text-amber-600'
                                : 'text-emerald-700'
                            }`}
                          >
                            {item.qty_on_hand}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px] whitespace-nowrap">
                            Stock non renseigné
                          </span>
                        )}
                      </td>

                      {/* Seuil Minimal */}
                      <td className="py-3.5 px-4 text-center font-mono text-slate-500 font-medium">
                        {item.min_stock != null ? item.min_stock : '—'}
                      </td>

                      {/* État */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(item.status, item.qty_on_hand)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <div>
              Affichage de {items.length} sur {totalCount} produit{totalCount > 1 ? 's' : ''}
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
    </div>
  );
};
