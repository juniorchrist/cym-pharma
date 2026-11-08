import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  CheckCircle,
  AlertTriangle,
  Lock,
  Download,
  Search,
  RefreshCw,
  Plus,
  ArrowRight,
  TrendingUp,
  FileCheck,
  CheckCircle2,
  BarChart3,
  ClipboardList,
} from 'lucide-react';
import {
  InventoryPeriod,
  InventoryCount,
  PeriodWithCounts,
  MonthlyInventoryReport,
} from '../../types/inventaire';
import { InventaireService } from '../../services/inventaire';
import { useToast } from '../../context/ToastContext';

interface InventairePeriodeProps {
  onOpenImport?: () => void;
}

export const InventairePeriode: React.FC<InventairePeriodeProps> = ({ onOpenImport }) => {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<'bilan' | 'comptage'>('bilan');
  const [periods, setPeriods] = useState<PeriodWithCounts[]>([]);
  const [activePeriod, setActivePeriod] = useState<InventoryPeriod | null>(null);
  const [counts, setCounts] = useState<
    (InventoryCount & { designation: string; unit_label: string; code: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'uncounted' | 'counted' | 'variance'>('all');
  const [search, setSearch] = useState('');

  // Bilan Mensuel state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [monthlyReport, setMonthlyReport] = useState<any | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Close period confirmation modal
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // Start new period modal
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [newYearMonth, setNewYearMonth] = useState(new Date().toISOString().slice(0, 7));

  const loadMonthlyReport = useCallback(async (year: number, month: number) => {
    setLoadingReport(true);
    const res = await InventaireService.getMonthlyReport(year, month);
    if (res.success && res.data) {
      setMonthlyReport(res.data);
    }
    setLoadingReport(false);
  }, []);

  useEffect(() => {
    loadMonthlyReport(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth, loadMonthlyReport]);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await InventaireService.getPeriods();
    if (res.success && res.data) {
      setPeriods(res.data);
      // Select open or counting period first, otherwise the most recent
      const openP = res.data.find((p) => p.status !== 'closed');
      if (openP) {
        setActivePeriod(openP);
        loadCounts(openP.id);
      } else if (res.data.length > 0) {
        setActivePeriod(res.data[0]);
        loadCounts(res.data[0].id);
      }
    } else {
      setError(res.message || 'Impossible de charger les périodes d\'inventaire.');
    }
    setLoading(false);
  }, []);

  const loadCounts = async (periodId: string) => {
    const res = await InventaireService.getPeriodCounts(periodId);
    if (res.success && res.data) {
      setCounts(res.data.counts);
      setActivePeriod(res.data.period);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  const handleUpdateCount = async (itemId: string, countedQtyVal: string, noteVal?: string) => {
    if (!activePeriod || activePeriod.status === 'closed') return;
    const val = countedQtyVal.trim() === '' ? null : parseInt(countedQtyVal, 10);

    const res = await InventaireService.updateCount(activePeriod.id, itemId, {
      counted_qty: val,
      note: noteVal,
      status: val !== null ? 'validated' : 'draft',
    });

    if (res.success && res.data) {
      setCounts((prev) =>
        prev.map((c) => (c.item_id === itemId ? { ...c, ...res.data! } : c))
      );
    }
  };

  const handleStartPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await InventaireService.startPeriod(newYearMonth);
    if (res.success && res.data) {
      showToast(`Période ${newYearMonth} démarrée`, 'success');
      setIsStartModalOpen(false);
      loadPeriods();
    } else {
      showToast(res.message || 'Erreur au démarrage de la période', 'error');
    }
  };

  const handleClosePeriod = async () => {
    if (!activePeriod) return;
    setClosing(true);
    const res = await InventaireService.closePeriod(activePeriod.id);
    if (res.success) {
      showToast(res.message || 'Période clôturée avec succès', 'success');
      setIsCloseModalOpen(false);
      loadPeriods();
    } else {
      showToast(res.message || 'Erreur lors de la clôture', 'error');
    }
    setClosing(false);
  };

  const handleExportCsv = async () => {
    if (!activePeriod) return;
    const url = await InventaireService.exportPeriodCsvUrl(activePeriod.id);
    window.open(url, '_blank');
  };

  // Filter counts
  const filteredCounts = counts.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        c.designation.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filterMode === 'uncounted') return c.counted_qty === null;
    if (filterMode === 'counted') return c.counted_qty !== null;
    if (filterMode === 'variance') return c.variance !== null && c.variance !== 0;
    return true;
  });

  const totalItems = counts.length;
  const countedCount = counts.filter((c) => c.counted_qty !== null).length;
  const varianceCount = counts.filter((c) => c.variance !== null && c.variance !== 0).length;
  const progressPercent = totalItems > 0 ? Math.round((countedCount / totalItems) * 100) : 0;

  const handleExportMonthlyCsv = async () => {
    const url = await InventaireService.exportMonthlyReportCsvUrl(selectedYear, selectedMonth);
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* SÉLECTEUR DE MODE : BILAN D'UTILISATION MENSUEL OU COMPTAGE PHYSIQUE */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setSubTab('bilan')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'bilan'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Bilan d'Utilisation Mensuel</span>
        </button>
        <button
          onClick={() => setSubTab('comptage')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'comptage'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Comptage Physique &amp; Clôture</span>
        </button>
      </div>

      {subTab === 'bilan' ? (
        /* ═══════════════════════════════════════════════════════════════════
           SECTION 6 : BILAN D'UTILISATION DU STOCK PAR MOIS
           ═══════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
          {/* BANNIÈRE & CONTRÔLES DU MOIS */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Bilan Mensuel des Stocks &amp; Consommation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synthèse des flux : Stock initial + Entrées - Sorties + Ajustements = Stock final
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none cursor-pointer"
              >
                {[
                  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
                ].map((m, idx) => (
                  <option key={idx + 1} value={idx + 1}>{m}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none cursor-pointer"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button
                onClick={() => loadMonthlyReport(selectedYear, selectedMonth)}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                title="Actualiser"
              >
                <RefreshCw className={`w-4 h-4 ${loadingReport ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={handleExportMonthlyCsv}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* 8 CARTOUCHES DE SYNTHÈSE GLOBALE MENSUELLE (CONFORME SECTION 7) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Articles</span>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {monthlyReport?.summary?.total_products ?? 0}
              </div>
              <span className="text-[9px] text-slate-400">Total concernés</span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Stock Initial</span>
              <div className="text-lg font-bold text-slate-700 mt-0.5 font-mono">
                {monthlyReport?.summary?.total_stock_initial ?? 0}
              </div>
              <span className="text-[9px] text-slate-400">Début de mois</span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
              <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block">Entrées (+)</span>
              <div className="text-lg font-bold text-emerald-700 mt-0.5 font-mono">
                +{monthlyReport?.summary?.total_entries ?? 0}
              </div>
              <span className="text-[9px] text-emerald-600">Achats / Réappro</span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-blue-100 bg-blue-50/20 shadow-xs">
              <span className="text-[9px] font-bold text-blue-700 uppercase tracking-wider block">Sorties (-)</span>
              <div className="text-lg font-bold text-blue-700 mt-0.5 font-mono">
                -{monthlyReport?.summary?.total_exits ?? 0}
              </div>
              <span className="text-[9px] text-blue-600">Commandes / Ventes</span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-amber-100 bg-amber-50/20 shadow-xs">
              <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block">Ajustements</span>
              <div className="text-lg font-bold text-amber-700 mt-0.5 font-mono">
                {(monthlyReport?.summary?.total_adjustments ?? 0) >= 0 ? '+' : ''}{monthlyReport?.summary?.total_adjustments ?? 0}
              </div>
              <span className="text-[9px] text-amber-600">Rectifications</span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-900 bg-slate-900 text-white shadow-xs">
              <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider block">Stock Final</span>
              <div className="text-lg font-bold text-white mt-0.5 font-mono">
                {monthlyReport?.summary?.total_stock_final ?? 0}
              </div>
              <span className="text-[9px] text-slate-300">Fin de mois</span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-red-100 bg-red-50/20 shadow-xs">
              <span className="text-[9px] font-bold text-red-700 uppercase tracking-wider block">Ruptures</span>
              <div className="text-lg font-bold text-red-700 mt-0.5">
                {monthlyReport?.summary?.count_ruptures ?? 0}
              </div>
              <span className="text-[9px] text-red-600">Stock = 0</span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-purple-100 bg-purple-50/20 shadow-xs">
              <span className="text-[9px] font-bold text-purple-700 uppercase tracking-wider block">Négatifs</span>
              <div className="text-lg font-bold text-purple-700 mt-0.5">
                {monthlyReport?.summary?.count_negatifs ?? 0}
              </div>
              <span className="text-[9px] text-purple-600">Stock &lt; 0</span>
            </div>
          </div>

          {/* TABLEAU DES ARTICLES AVEC BILAN */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Détail par Produit — {monthlyReport?.month_label || 'Mois en cours'}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Désignation</th>
                    <th className="py-3 px-4 text-center">Unité</th>
                    <th className="py-3 px-4 text-center">Stock Initial</th>
                    <th className="py-3 px-4 text-center text-emerald-600">Entrées (+)</th>
                    <th className="py-3 px-4 text-center text-blue-600">Sorties (-)</th>
                    <th className="py-3 px-4 text-center text-amber-600">Ajustements</th>
                    <th className="py-3 px-4 text-center font-bold">Stock Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingReport ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                      <tr key={`skel-rep-${idx}`} className="animate-pulse">
                        <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-48" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-16 mx-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></td>
                        <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></td>
                      </tr>
                    ))
                  ) : !monthlyReport?.products || monthlyReport.products.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 px-4 text-center">
                        <div className="max-w-md mx-auto space-y-2 text-slate-500">
                          <BarChart3 className="w-10 h-10 text-slate-300 mx-auto" />
                          <p className="font-bold text-slate-800 text-sm">
                            Aucun mouvement historique pour {monthlyReport?.month_label || 'cette période'}
                          </p>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            Aucun flux n'a été enregistré pour ce mois. Les bilans sont calculés strictement à partir des mouvements réels (achats, ventes, ajustements et imports).
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    monthlyReport.products.map((p: any) => (
                      <tr key={p.item_id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono text-slate-600 font-bold">{p.code}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{p.designation}</td>
                        <td className="py-3 px-4 text-center text-slate-500">{p.unit_label}</td>
                        <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">{p.stock_initial}</td>
                        <td className="py-3 px-4 text-center font-mono font-semibold text-emerald-700">
                          {p.entries > 0 ? `+${p.entries}` : '0'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold text-blue-700">
                          {p.exits > 0 ? `-${p.exits}` : '0'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-amber-700">
                          {p.adjustments !== 0 ? (p.adjustments > 0 ? `+${p.adjustments}` : p.adjustments) : '0'}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 bg-slate-50/50">
                          {p.stock_final}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════
           SECTION COMPTAGE PHYSIQUE & CLÔTURE
           ═══════════════════════════════════════════════════════════════════ */
        <div className="space-y-6">
      {/* 1. SÉLECTEUR DE PÉRIODE & BANNIÈRE */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Inventaire Physique Mensuel :{' '}
                <span className="text-emerald-700 font-mono">
                  {activePeriod ? activePeriod.year_month : 'Aucune période'}
                </span>
              </h2>
              {activePeriod?.status === 'closed' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  <Lock className="w-3 h-3" /> Clôturé
                </span>
              ) : activePeriod ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse">
                  <CheckCircle className="w-3 h-3" /> Comptage en cours
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Comptage en boutique de fin de mois avec rapprochement automatique des écarts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {periods.length > 1 && (
            <select
              value={activePeriod?.id || ''}
              onChange={(e) => {
                const p = periods.find((x) => x.id === e.target.value);
                if (p) {
                  setActivePeriod(p);
                  loadCounts(p.id);
                }
              }}
              className="text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none cursor-pointer"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.year_month} ({p.status === 'closed' ? 'Clôturé' : 'En cours'})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleExportCsv}
            disabled={!activePeriod}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            title="Exporter l'inventaire en CSV / Excel"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          {activePeriod?.status !== 'closed' ? (
            <button
              onClick={() => setIsCloseModalOpen(true)}
              disabled={countedCount === 0}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-black rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Clôturer le mois</span>
            </button>
          ) : (
            <button
              onClick={() => setIsStartModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Démarrer un nouveau mois</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. PROGRESSION ET STATS DE COMPTAGE */}
      {activePeriod && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Articles à Compter
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{totalItems}</div>
            <div className="text-[10px] text-slate-500 mt-1">Articles suivis au catalogue</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
              Articles Comptés
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">
              {countedCount} <span className="text-xs font-normal text-slate-400">/ {totalItems}</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
              Écarts Détectés
            </div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{varianceCount}</div>
            <div className="text-[10px] text-slate-500 mt-1">
              {varianceCount > 0
                ? 'Nécessiteront un ajustement lors de la clôture'
                : 'Stocks physiques conformes au théorique'}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Avancement
            </div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{progressPercent}%</div>
            <div className="text-[10px] text-slate-500 mt-1">
              {progressPercent === 100
                ? '✓ Tous les articles ont été vérifiés'
                : `${totalItems - countedCount} article(s) restant(s)`}
            </div>
          </div>
        </div>
      )}

      {/* 3. BARRE DE RECHERCHE ET ONGLETS DE FILTRE */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par article ou code..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              filterMode === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tous ({counts.length})
          </button>
          <button
            onClick={() => setFilterMode('uncounted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              filterMode === 'uncounted'
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            À compter ({totalItems - countedCount})
          </button>
          <button
            onClick={() => setFilterMode('counted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              filterMode === 'counted'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Comptés ({countedCount})
          </button>
          <button
            onClick={() => setFilterMode('variance')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              filterMode === 'variance'
                ? 'bg-red-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Avec écarts ({varianceCount})
          </button>
        </div>
      </div>

      {/* 4. TABLEAU DE SAISIE DE L'INVENTAIRE PHYSIQUE */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="py-3.5 px-4">Code</th>
                <th className="py-3.5 px-4">Désignation</th>
                <th className="py-3.5 px-4">Conditionnement</th>
                <th className="py-3.5 px-4 text-center">Stock Théorique</th>
                <th className="py-3.5 px-4 text-center">Stock Physique Compté</th>
                <th className="py-3.5 px-4 text-center">Écart</th>
                <th className="py-3.5 px-4">Observation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`skel-cnt-${idx}`} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-slate-200 rounded w-48" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-4 bg-slate-200 rounded w-12 mx-auto" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-8 bg-slate-200 rounded w-20 mx-auto" /></td>
                    <td className="py-4 px-4 text-center"><div className="h-4 bg-slate-200 rounded w-10 mx-auto" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-slate-200 rounded w-24" /></td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <div className="max-w-md mx-auto p-6 rounded-2xl bg-red-50 border border-red-200 text-red-800 space-y-3">
                      <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
                      <p className="font-bold text-sm">Échec du chargement de l'inventaire</p>
                      <p className="text-xs text-red-600">{error}</p>
                      <button
                        type="button"
                        onClick={loadPeriods}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Réessayer</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredCounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 px-4 text-center">
                    <div className="max-w-md mx-auto space-y-3 text-slate-500">
                      <div className="w-14 h-14 rounded-3xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <Calendar className="w-7 h-7" />
                      </div>
                      <p className="font-extrabold text-base text-slate-800">
                        {!activePeriod
                          ? "Aucune période d'inventaire ouverte"
                          : "Aucun article correspondant aux critères"}
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {!activePeriod
                          ? "Démarrez une nouvelle session d'inventaire mensuel pour effectuer le comptage physique de votre stock."
                          : "Aucun article ne correspond à vos filtres actuels."}
                      </p>
                      {!activePeriod && (
                        <div className="flex items-center justify-center gap-3 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsStartModalOpen(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition cursor-pointer shadow-sm"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Démarrer un inventaire</span>
                          </button>
                          {onOpenImport && (
                            <button
                              type="button"
                              onClick={onOpenImport}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                            >
                              <span>Importer un classeur</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCounts.map((c) => {
                  const isClosed = activePeriod?.status === 'closed';
                  const hasVariance = c.variance !== null && c.variance !== 0;

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-50/80 transition ${
                        hasVariance ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-600">
                        {c.code}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-md">
                        {c.designation}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px]">
                          {c.unit_label || 'Unité'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                        {c.theoretical_qty}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isClosed ? (
                          <span className="font-bold text-slate-900">
                            {c.counted_qty ?? '—'}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            placeholder="Compté..."
                            defaultValue={c.counted_qty !== null ? c.counted_qty : ''}
                            onBlur={(e) => handleUpdateCount(c.item_id, e.target.value, c.note || undefined)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            className={`w-24 text-center py-1.5 px-2 font-bold text-xs rounded-xl border outline-none transition ${
                              c.counted_qty !== null
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                                : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:border-emerald-500'
                            }`}
                          />
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {c.variance === null ? (
                          <span className="text-slate-300 font-mono">—</span>
                        ) : c.variance === 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> 0
                          </span>
                        ) : c.variance < 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                            {c.variance}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            +{c.variance}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        {isClosed ? (
                          <span className="text-slate-500 italic text-[11px]">{c.note || '—'}</span>
                        ) : (
                          <input
                            type="text"
                            placeholder="Note..."
                            defaultValue={c.note || ''}
                            onBlur={(e) => handleUpdateCount(c.item_id, String(c.counted_qty ?? ''), e.target.value)}
                            className="w-full py-1 px-2 text-[11px] rounded-lg border border-transparent hover:border-slate-200 focus:border-emerald-500 focus:bg-white outline-none"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      )}

      {/* 5. MODALE DE CONFIRMATION DE CLÔTURE DU MOIS */}
      {isCloseModalOpen && activePeriod && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Clôturer l'inventaire {activePeriod.year_month}
                </h3>
                <p className="text-xs text-slate-500">
                  Cette action est définitive et gèle le mois.
                </p>
              </div>
            </div>

            <div className="my-4 space-y-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total articles inventoriés :</span>
                  <strong className="text-slate-900">{countedCount} / {totalItems}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Écarts constatés :</span>
                  <strong className={varianceCount > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                    {varianceCount} article(s)
                  </strong>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[11px] leading-relaxed">
                <strong>Attention :</strong> Lors de la clôture, des mouvements de{' '}
                <em>correction d'inventaire</em> seront automatiquement générés pour synchroniser
                les stocks théoriques avec les quantités physiques comptées.
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={closing}
                onClick={() => setIsCloseModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={closing}
                onClick={handleClosePeriod}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-black rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {closing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>Confirmer la clôture</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODALE DE DÉMARRAGE D'UNE NOUVELLE PÉRIODE */}
      {isStartModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Démarrer un Nouvel Inventaire Mensuel
              </h3>
              <button
                onClick={() => setIsStartModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStartPeriod} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mois de l'inventaire (Année-Mois) *
                </label>
                <input
                  type="month"
                  required
                  value={newYearMonth}
                  onChange={(e) => setNewYearMonth(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500 font-bold"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Tous les articles suivis seront automatiquement pré-chargés avec leur stock théorique actuel.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStartModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition cursor-pointer"
                >
                  Démarrer le comptage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
