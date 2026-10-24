import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Download,
  Calendar,
  Lock,
  CheckCircle,
  FileSpreadsheet,
  RefreshCw,
  Search,
} from 'lucide-react';
import { PeriodWithCounts } from '../../types/inventaire';
import { InventaireService } from '../../services/inventaire';
import { useToast } from '../../context/ToastContext';

export const InventaireHistorique: React.FC = () => {
  const { showToast } = useToast();
  const [periods, setPeriods] = useState<PeriodWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    const res = await InventaireService.getPeriods();
    if (res.success && res.data) {
      setPeriods(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  const handleExport = async (periodId: string) => {
    const url = await InventaireService.exportPeriodCsvUrl(periodId);
    window.open(url, '_blank');
  };

  const closedPeriods = periods.filter((p) => p.status === 'closed');

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Historique des Inventaires Mensuels
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Archives des clôtures mensuelles avec audit complet et export certifié
            </p>
          </div>
        </div>

        <button
          onClick={() => loadPeriods()}
          className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 self-start sm:self-center cursor-pointer"
          title="Rafraîchir"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200/80">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
            Chargement des archives d'inventaire...
          </div>
        ) : closedPeriods.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200/80 p-8">
            <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">Aucun mois clôturé pour l'instant</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Une fois un inventaire physique terminé et clôturé dans l'onglet « Inventaire Mensuel », son archive apparaîtra ici avec son rapport complet.
            </p>
          </div>
        ) : (
          closedPeriods.map((p) => (
            <div
              key={p.id}
              className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-300 transition"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {p.year_month}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    <Lock className="w-2.5 h-2.5" /> Clôturé
                  </span>
                </div>

                <div className="py-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Articles inventoriés :</span>
                    <strong className="text-slate-800">{p.total_items}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Comptés :</span>
                    <strong className="text-emerald-700">{p.counted_items}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Écarts corrigés :</span>
                    <strong className={p.items_with_variance > 0 ? 'text-amber-700' : 'text-slate-700'}>
                      {p.items_with_variance}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date de clôture :</span>
                    <span className="font-mono text-slate-600">
                      {p.closed_at ? p.closed_at.split('T')[0] : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleExport(p.id)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl transition cursor-pointer border border-slate-200"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>Télécharger Rapport Excel / CSV</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
