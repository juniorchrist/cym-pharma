import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  CheckCheck,
  ShieldAlert,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ImportPreviewResult,
  ImportPreviewRow,
  ImportCommitPayload,
} from '../../types/inventaire';
import { InventaireService } from '../../services/inventaire';
import { useToast } from '../../context/ToastContext';

interface InventaireImportProps {
  onImportComplete?: () => void;
}

export const InventaireImport: React.FC<InventaireImportProps> = ({ onImportComplete }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().split('T')[0]);

  // 1. Charger depuis le fichier Classeur1.xlsx du serveur
  const handleLoadFromServer = async () => {
    setLoading(true);
    const res = await InventaireService.previewImportFromServer();
    if (res.success && res.data) {
      setPreview(res.data);
      showToast('Aperçu du classeur Classeur1.xlsx généré avec succès', 'success');
    } else {
      showToast(res.message || 'Impossible de lire le fichier sur le serveur', 'error');
    }
    setLoading(false);
  };

  // 2. Charger depuis un fichier uploadé par l'utilisateur
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

        // Parse starting from row 4 if headers exist or row 1
        const startIndex = rawData.length > 3 && rawData[0].some((c: any) => typeof c === 'string' && c.includes('DESIGNATION')) ? 3 : 0;
        const rows = rawData.slice(startIndex).filter((r) => r[0] && typeof r[0] === 'string' && r[0].trim());

        const parsedRows = rows.map((r) => ({
          designation: r[0],
          stock_opening: r[1],
          stock_current: r[2] ?? r[1],
          unit: r.length > 3 && typeof r[3] === 'string' ? r[3] : undefined,
        }));

        const res = await InventaireService.previewImportRows(parsedRows);
        if (res.success && res.data) {
          setPreview(res.data);
          showToast(`Fichier ${file.name} analysé : ${res.data.total_rows} articles trouvés`, 'success');
        } else {
          showToast(res.message || 'Erreur lors de l\'analyse du fichier', 'error');
        }
      } catch (err: any) {
        showToast('Erreur de lecture du fichier Excel: ' + err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Row update helpers
  const updateRowAction = (idx: number, action: 'import' | 'skip' | 'import_as_zero') => {
    if (!preview) return;
    setPreview((prev) => {
      if (!prev) return prev;
      const nextRows = [...prev.rows];
      nextRows[idx] = { ...nextRows[idx], action };
      return { ...prev, rows: nextRows };
    });
  };

  const updateRowTracked = (idx: number, is_tracked: boolean) => {
    if (!preview) return;
    setPreview((prev) => {
      if (!prev) return prev;
      const nextRows = [...prev.rows];
      nextRows[idx] = { ...nextRows[idx], is_tracked };
      return { ...prev, rows: nextRows };
    });
  };

  // Batch actions
  const handleBatchAllTracked = (val: boolean) => {
    if (!preview) return;
    setPreview({
      ...preview,
      rows: preview.rows.map((r) => ({ ...r, is_tracked: val })),
    });
  };

  const handleBatchSkipDuplicates = () => {
    if (!preview) return;
    setPreview({
      ...preview,
      rows: preview.rows.map((r) => (r.is_duplicate ? { ...r, action: 'skip' } : r)),
    });
    showToast('Doublons configurés pour exclusion', 'info');
  };

  const handleCommit = async () => {
    if (!preview) return;
    setCommitting(true);
    const payload: ImportCommitPayload = {
      rows: preview.rows,
      movement_date: movementDate,
    };

    const res = await InventaireService.commitImport(payload);
    if (res.success) {
      showToast(res.message || 'Importation terminée avec succès !', 'success');
      if (onImportComplete) {
        onImportComplete();
      }
    } else {
      showToast(res.message || 'Erreur lors de l\'importation', 'error');
    }
    setCommitting(false);
  };

  const filteredRows = preview?.rows.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      const match =
        r.designation_raw.toLowerCase().includes(q) ||
        r.designation_clean.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filterAction === 'negative') return r.is_negative;
    if (filterAction === 'duplicates') return r.is_duplicate;
    if (filterAction === 'skip') return r.action === 'skip';
    if (filterAction === 'import') return r.action === 'import' || r.action === 'import_as_zero';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. ENTÊTE D'IMPORT */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Import &amp; Remplacement du Classeur Excel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Intégration du classeur mensuel avec détection automatique des anomalies et aperçu avant validation
            </p>
          </div>
        </div>
      </div>

      {/* 2. ZONE DE CHARGEMENT DU FICHIER */}
      {!preview && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-emerald-300 transition">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Fichier Source Serveur : Classeur1.xlsx
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Le classeur des stocks d'Octobre 2026 est présent sur le serveur (300 articles, dont 41 en stock positif, 9 valeurs négatives et 2 doublons).
              </p>
            </div>
            <button
              onClick={handleLoadFromServer}
              disabled={loading}
              className="mt-6 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition cursor-pointer shadow-sm disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              <span>Analyser Classeur1.xlsx et afficher l'aperçu</span>
            </button>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-400 transition">
            <div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-3">
                <Upload className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Glisser-déposer un Fichier (.xlsx / .csv)
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Vous pouvez également téléverser une version mise à jour ou un autre classeur mensuel depuis votre poste.
              </p>
            </div>

            <label className="mt-6 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer border border-slate-200">
              <Upload className="w-4 h-4 text-slate-500" />
              <span>Choisir un fichier sur mon poste</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* 3. TABLEAU D'APERÇU INTERACTIF (SI PRÉVISUALISATION ACTIVE) */}
      {preview && (
        <div className="space-y-4">
          {/* STATISTIQUES DE L'ANALYSE */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Total Lignes</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{preview.total_rows}</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Stock Positif</div>
              <div className="text-xl font-bold text-emerald-700 mt-0.5">{preview.valid}</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-purple-200 bg-purple-50/20 shadow-sm">
              <div className="text-[10px] font-bold text-purple-700 uppercase">Stocks Négatifs</div>
              <div className="text-xl font-bold text-purple-700 mt-0.5">{preview.negative}</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm">
              <div className="text-[10px] font-bold text-amber-700 uppercase">Doublons Détectés</div>
              <div className="text-xl font-bold text-amber-700 mt-0.5">{preview.duplicates}</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Stock Nul (0)</div>
              <div className="text-xl font-bold text-slate-600 mt-0.5">{preview.zero_stock}</div>
            </div>
          </div>

          {/* RÈGLE DES VALEURS NÉGATIVES */}
          {preview.negative > 0 && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
              <div className="text-xs text-purple-900 leading-relaxed">
                <strong>Traitement des {preview.negative} stocks négatifs :</strong> Conformément aux règles d'inventaire, ces articles sont automatiquement configurés pour être importés à <strong>0</strong> avec une mention traçable dans leur historique (ex: <em>"Valeur négative (-50) dans classeur"</em>). Vous pouvez choisir de les exclure ci-dessous article par article si souhaité.
              </div>
            </div>
          )}

          {/* BARRE DE CONTRÔLE D'APERÇU */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filtrer les articles d'aperçu..."
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => handleBatchSkipDuplicates()}
                className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition cursor-pointer"
              >
                Exclure les doublons
              </button>
              <button
                onClick={() => handleBatchAllTracked(true)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Tout marquer « Suivi »
              </button>
              <button
                onClick={() => setPreview(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Changer de fichier
              </button>
            </div>
          </div>

          {/* TABLEAU DES LIGNES PRÉVISUALISÉES */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">Ligne #</th>
                    <th className="py-3 px-4">Désignation</th>
                    <th className="py-3 px-4">Conditionnement</th>
                    <th className="py-3 px-4 text-center">Stock Classeur</th>
                    <th className="py-3 px-4 text-center">Suivi de Stock</th>
                    <th className="py-3 px-4 text-center">Action d'Import</th>
                    <th className="py-3 px-4">Observation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows?.map((r) => {
                    const originalIdx = preview.rows.findIndex((x) => x.row_index === r.row_index);

                    return (
                      <tr
                        key={r.row_index}
                        className={`hover:bg-slate-50/80 transition ${
                          r.is_duplicate
                            ? 'bg-amber-50/40'
                            : r.is_negative
                            ? 'bg-purple-50/40'
                            : r.action === 'skip'
                            ? 'opacity-50'
                            : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-slate-400">
                          L.{r.row_index}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 max-w-sm">
                          <div>{r.designation_raw}</div>
                          {r.is_duplicate && (
                            <span className="inline-block mt-1 text-[10px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-bold">
                              Doublon détecté
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px]">
                            {r.unit_label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-bold">
                          {r.is_negative ? (
                            <span className="text-purple-700 font-bold">{r.stock_current}</span>
                          ) : (
                            <span className={r.stock_current > 0 ? 'text-emerald-700' : 'text-slate-400'}>
                              {r.stock_current}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={r.is_tracked}
                            onChange={(e) => updateRowTracked(originalIdx, e.target.checked)}
                            className="accent-emerald-600 w-4 h-4 rounded cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <select
                            value={r.action}
                            onChange={(e) => updateRowAction(originalIdx, e.target.value as any)}
                            className="text-xs font-semibold rounded-lg px-2 py-1 border border-slate-200 outline-none bg-white cursor-pointer"
                          >
                            <option value="import">Importer</option>
                            <option value="import_as_zero">Importer à 0</option>
                            <option value="skip">Ignorer (Exclure)</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-500 max-w-xs truncate">
                          {r.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* BOUTON DE CONFIRMATION FINALE */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                  Date d'enregistrement des mouvements initiaux
                </label>
                <input
                  type="date"
                  value={movementDate}
                  onChange={(e) => setMovementDate(e.target.value)}
                  className="mt-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 outline-none font-bold text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={committing}
                onClick={handleCommit}
                className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {committing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                <span>Confirmer et Importer dans l'Inventaire</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
