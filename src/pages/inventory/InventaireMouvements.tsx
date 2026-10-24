import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  Plus,
  Search,
  RefreshCw,
  ShoppingCart,
  Truck,
  CheckCircle2,
} from 'lucide-react';
import { MovementWithItem, MovementType, CreateMovementPayload, InventoryItemWithStatus } from '../../types/inventaire';
import { InventaireService } from '../../services/inventaire';
import { useToast } from '../../context/ToastContext';

export const InventaireMouvements: React.FC = () => {
  const { showToast } = useToast();
  const [movements, setMovements] = useState<MovementWithItem[]>([]);
  const [items, setItems] = useState<InventoryItemWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Modal new movement
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [mvtType, setMvtType] = useState<MovementType>('purchase');
  const [mvtQty, setMvtQty] = useState('');
  const [mvtDate, setMvtDate] = useState(new Date().toISOString().split('T')[0]);
  const [mvtReason, setMvtReason] = useState('');

  const loadMovements = useCallback(async () => {
    setLoading(true);
    const res = await InventaireService.getMovements({
      type: typeFilter !== 'all' ? typeFilter : undefined,
      limit: 200,
    });
    if (res.success && res.data) {
      setMovements(res.data.movements);
    }
    setLoading(false);
  }, [typeFilter]);

  const loadItems = async () => {
    const res = await InventaireService.getItems({ limit: 200 });
    if (res.success && res.data) {
      setItems(res.data.items);
      if (res.data.items.length > 0 && !selectedItemId) {
        setSelectedItemId(res.data.items[0].id);
      }
    }
  };

  useEffect(() => {
    loadMovements();
    loadItems();
  }, [loadMovements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      showToast('Veuillez sélectionner un article', 'error');
      return;
    }
    const qty = parseInt(mvtQty, 10);
    if (!qty || qty <= 0) {
      showToast('Veuillez entrer une quantité valide', 'error');
      return;
    }

    const payload: CreateMovementPayload = {
      item_id: selectedItemId,
      type: mvtType,
      quantity: qty,
      movement_date: mvtDate,
      reason: mvtReason.trim() || undefined,
    };

    const res = await InventaireService.createMovement(payload);
    if (res.success) {
      showToast('Mouvement enregistré avec succès', 'success');
      setIsModalOpen(false);
      setMvtQty('');
      setMvtReason('');
      loadMovements();
    } else {
      showToast(res.message || 'Erreur lors de l\'enregistrement', 'error');
    }
  };

  const getMovementBadge = (type: MovementType, qty: number) => {
    switch (type) {
      case 'purchase':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ArrowDownRight className="w-3.5 h-3.5" /> Achat (+{qty})
          </span>
        );
      case 'opening':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Stock Initial (+{qty})
          </span>
        );
      case 'sale_shop':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ArrowUpRight className="w-3.5 h-3.5" /> Vente Boutique (-{qty})
          </span>
        );
      case 'sale_online':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Truck className="w-3.5 h-3.5" /> Expédition Commande (-{qty})
          </span>
        );
      case 'loss':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            <AlertTriangle className="w-3.5 h-3.5" /> Perte / Casse (-{qty})
          </span>
        );
      case 'return':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <RotateCcw className="w-3.5 h-3.5" /> Retour (+{qty})
          </span>
        );
      case 'count_correction':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Correction Inventaire ({qty})
          </span>
        );
      case 'adjustment':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Ajustement ({qty})
          </span>
        );
    }
  };

  const filteredMovements = movements.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.designation && m.designation.toLowerCase().includes(q)) ||
      (m.reason && m.reason.toLowerCase().includes(q)) ||
      (m.order_id && m.order_id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* BARRE D'ACTIONS ET FILTRES */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par désignation, motif, n° de commande..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500 bg-slate-50/50"
            />
          </div>
          <button
            onClick={() => loadMovements()}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none cursor-pointer"
          >
            <option value="all">Tous les types de mouvement</option>
            <option value="purchase">Achats (Entrées)</option>
            <option value="sale_shop">Ventes Boutique (Sorties)</option>
            <option value="sale_online">Ventes B2B en Ligne</option>
            <option value="loss">Pertes &amp; Casses</option>
            <option value="return">Retours</option>
            <option value="count_correction">Corrections d'inventaire</option>
            <option value="opening">Stocks Initiaux</option>
          </select>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Enregistrer un Mouvement</span>
          </button>
        </div>
      </div>

      {/* TABLEAU JOURNAL DES MOUVEMENTS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Journal Chronologique des Mouvements (Audit Trail)
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            {filteredMovements.length} entrée(s) affichée(s)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Article</th>
                <th className="py-3 px-4">Opération &amp; Flux</th>
                <th className="py-3 px-4">Motif / Justificatif</th>
                <th className="py-3 px-4">Opérateur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    Chargement du journal des stocks...
                  </td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Aucun mouvement enregistré pour cette sélection.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {m.movement_date || m.created_at.split('T')[0]}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-sm">
                      <div>{m.designation}</div>
                      <div className="text-[10px] font-normal text-slate-400">{m.unit_label || 'Unité'}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getMovementBadge(m.type, m.quantity)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                      {m.reason || (m.order_id ? `Commande #${m.order_id}` : '—')}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                        {m.created_by || 'Admin'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALE D'AJOUT DE MOUVEMENT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Enregistrer une Entrée / Sortie
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Article concerné *
                </label>
                <select
                  required
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500 bg-white"
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.code} — {it.designation} (Stock: {it.qty_on_hand})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Type d'opération *
                </label>
                <select
                  value={mvtType}
                  onChange={(e) => setMvtType(e.target.value as MovementType)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500 bg-white"
                >
                  <option value="purchase">Entrée — Achat fournisseur (+)</option>
                  <option value="sale_shop">Sortie — Vente boutique comptoir (-)</option>
                  <option value="loss">Sortie — Perte / Casse / Périmé (-)</option>
                  <option value="return">Entrée — Retour client (+)</option>
                  <option value="adjustment">Ajustement exceptionnel</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantité *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={mvtQty}
                    onChange={(e) => setMvtQty(e.target.value)}
                    placeholder="ex: 15"
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date du mouvement *
                  </label>
                  <input
                    type="date"
                    required
                    value={mvtDate}
                    onChange={(e) => setMvtDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motif / Justificatif / N° de pièce
                </label>
                <input
                  type="text"
                  value={mvtReason}
                  onChange={(e) => setMvtReason(e.target.value)}
                  placeholder="ex: BL n° 8821 Pharmacie Centrale"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
