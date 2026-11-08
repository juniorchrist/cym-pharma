import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  CheckCheck,
  ShieldAlert,
  Info,
  ArrowRight,
} from 'lucide-react';
import {
  ImportPreviewResult,
  ImportPreviewRow,
  ImportCommitPayload,
  ImportCommitResult,
} from '../../types/inventaire';
import { InventaireService } from '../../services/inventaire';
import { useToast } from '../../context/ToastContext';

interface InventaireImportProps {
  onImportComplete?: () => void;
}

export const InventaireImport: React.FC<InventaireImportProps> = ({ onImportComplete }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ current: number; total: number; percent: number }>({
    current: 0,
    total: 0,
    percent: 0,
  });
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().split('T')[0]);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ─── 1. TRAITEMENT DU FICHIER (DYNAMIC IMPORT XLSX + BROWSER PARSING) ───────
  const processFile = async (file: File) => {
    setErrorMessage(null);
    setCommitResult(null);

    // Vérification stricte de la taille (5 Mo max)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const err = `Fichier trop volumineux (${sizeMb} Mo). La taille maximale autorisée est de 5 Mo.`;
      setErrorMessage(err);
      showToast(err, 'error');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      const err = 'Format non supporté. Veuillez sélectionner un fichier Excel (.xlsx, .xls) ou CSV (.csv).';
      setErrorMessage(err);
      showToast(err, 'error');
      return;
    }

    setLoading(true);
    setLoadingStep('Chargement du module de lecture Excel...');

    try {
      // CHARGEMENT À LA DEMANDE DE LA BIBLIOTHÈQUE XLSX
      const XLSX = await import('xlsx');

      setLoadingStep('Lecture du fichier en mémoire...');
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const wb = XLSX.read(data, { type: 'array' });

      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('Le classeur Excel ne contient aucune feuille de calcul.');
      }

      setLoadingStep('Analyse des lignes et des colonnes...');
      // Priorité à la feuille 'Stocks Octobre 2026' ou toute feuille contenant 'Stock'
      let sheetName = wb.SheetNames[0];
      const stockSheet = wb.SheetNames.find((s) => /stock|octobre/i.test(s));
      if (stockSheet) {
        sheetName = stockSheet;
      }
      const sheet = wb.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (!rawData || rawData.length === 0) {
        throw new Error('Le fichier sélectionné est vide.');
      }

      // Détection automatique de la première ligne de données (à partir de la ligne 6 ou après l'en-tête)
      let startIndex = 0;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (Array.isArray(row) && row.some((c) => typeof c === 'string' && /désignation|designation|article|produit/i.test(c))) {
          startIndex = i + 1;
          break;
        }
      }

      const rows = rawData.slice(startIndex);
      const seen = new Set<string>();
      const previewRows: ImportPreviewRow[] = [];
      let duplicates = 0;
      let negative = 0;
      let zero_stock = 0;
      let valid = 0;
      let ignored = 0;

      rows.forEach((r, idx) => {
        if (!r || !Array.isArray(r)) {
          ignored++;
          return;
        }

        // Colonnes lues : Col A = Désignation, Col B = Stock initial, Col C = Stock en cours
        const rawDes = String(r[0] || '').trim();
        if (!rawDes) {
          ignored++;
          return;
        }

        // Nettoyage de la désignation (espaces, casse)
        const cleanDes = rawDes.toUpperCase().replace(/\s+/g, ' ');

        const opening = Number(r[1]) || 0;
        const current = r[2] !== undefined && r[2] !== null && r[2] !== ''
          ? Number(r[2])
          : opening;

        const isDup = seen.has(cleanDes);
        seen.add(cleanDes);
        if (isDup) duplicates++;

        const isNeg = current < 0;
        if (isNeg) negative++;
        if (current === 0) zero_stock++;
        if (current > 0 && !isDup) valid++;

        let unitLabel = typeof r[3] === 'string' && r[3].trim() ? r[3].trim() : 'Unité';
        if (unitLabel === 'Unité') {
          if (rawDes.includes('B/100')) unitLabel = 'Boîte de 100';
          else if (rawDes.includes('B/50')) unitLabel = 'Boîte de 50';
          else if (rawDes.includes('B/12')) unitLabel = 'Boîte de 12';
          else if (rawDes.includes('B/25')) unitLabel = 'Boîte de 25';
          else if (rawDes.includes('P/100')) unitLabel = 'Paquet de 100';
          else if (rawDes.includes('5L')) unitLabel = 'Bidon 5L';
          else if (rawDes.includes('1L')) unitLabel = 'Flacon 1L';
        }

        // ✅ RÈGLE FONDAMENTALE : Les stocks négatifs sont préservés fidèlement (action: 'import')
        // Les doublons sont marqués 'skip' mais peuvent être réactivés
        previewRows.push({
          row_index: startIndex + idx + 1,
          designation_raw: rawDes,
          designation_clean: cleanDes,
          unit_label: unitLabel,
          stock_opening: opening,
          stock_current: current,
          is_negative: isNeg,
          is_duplicate: isDup,
          action: isDup ? 'skip' : 'import',
          note: isNeg
            ? `Stock négatif (${current}) conservé fidèlement pour vérification`
            : isDup
            ? 'Doublon détecté avec une ligne précédente'
            : undefined,
        });
      });

      if (previewRows.length === 0) {
        throw new Error('Aucun article valide trouvé dans la feuille sélectionnée.');
      }

      setFileName(file.name);
      setPreview({
        total_rows: previewRows.length,
        valid,
        duplicates,
        negative,
        zero_stock,
        ignored,
        rows: previewRows,
      });

      showToast(`Fichier analysé : ${previewRows.length} article(s) détecté(s).`, 'success');
    } catch (err: any) {
      console.error('[Import Parse Error]', err);
      const msg = err?.message || 'Erreur lors de la lecture du classeur.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
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

  const handleBatchSkipDuplicates = () => {
    if (!preview) return;
    setPreview({
      ...preview,
      rows: preview.rows.map((r) => (r.is_duplicate ? { ...r, action: 'skip' } : r)),
    });
    showToast('Tous les doublons sont configurés pour exclusion.', 'info');
  };

  // ─── 2. IMPORTATION PAR LOTS DE 50 AVEC PROGRESSION & RETOUR DÉTAILLÉ ───────
  const handleCommit = async () => {
    if (!preview || preview.rows.length === 0) return;

    setCommitting(true);
    setErrorMessage(null);
    setCommitResult(null);

    const CHUNK_SIZE = 50;
    const allRows = preview.rows;
    const totalBatches = Math.ceil(allRows.length / CHUNK_SIZE);

    let cumulativeCreated = 0;
    let cumulativeUpdated = 0;
    let cumulativeSkipped = 0;
    let cumulativeMovements = 0;

    try {
      for (let i = 0; i < totalBatches; i++) {
        const chunk = allRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const percent = Math.round(((i + 1) / totalBatches) * 100);

        setCommitProgress({
          current: i + 1,
          total: totalBatches,
          percent,
        });

        const payload: ImportCommitPayload = {
          rows: chunk,
          movement_date: movementDate,
        };

        const res = await InventaireService.commitImport(payload);

        if (!res.success) {
          throw new Error(
            res.message || `Erreur lors de l'enregistrement du lot ${i + 1}/${totalBatches}.`
          );
        }

        if (res.data) {
          cumulativeCreated += res.data.created || 0;
          cumulativeUpdated += res.data.updated || 0;
          cumulativeSkipped += res.data.skipped || 0;
          cumulativeMovements += res.data.movements_created || 0;
        }
      }

      const finalResult: ImportCommitResult = {
        created: cumulativeCreated,
        updated: cumulativeUpdated,
        skipped: cumulativeSkipped,
        total_processed: allRows.length,
        movements_created: cumulativeMovements,
      };

      setCommitResult(finalResult);
      showToast(
        `Importation réussie : ${cumulativeCreated} créé(s), ${cumulativeUpdated} mis à jour, ${cumulativeSkipped} ignoré(s).`,
        'success'
      );

      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err: any) {
      console.error('[Commit Error]', err);
      const msg = err?.message || 'Erreur inattendue pendant l\'enregistrement.';
      setErrorMessage(msg);
      showToast(msg, 'error');
    } finally {
      setCommitting(false);
    }
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
      {/* 1. EN-TÊTE D'IMPORT */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Import &amp; Mise à Jour du Stock Excel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Téléversez un classeur .xlsx ou .csv pour analyser et importer vos articles sans doublon
            </p>
          </div>
        </div>

        {preview && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              setCommitResult(null);
              setErrorMessage(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="self-start sm:self-center px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Choisir un autre fichier
          </button>
        )}
      </div>

      {/* 2. MESSAGE D'ERREUR EXPLICITE (SI PRÉSENT) */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-xs text-red-800">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Échec de l'opération :</p>
            <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-700 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. RAPPORT DU DERNIER IMPORT (SI RÉUSSI) */}
      {commitResult && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-3xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            <span>Importation terminée et enregistrée avec succès</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
            <div className="bg-white p-3 rounded-2xl border border-emerald-100 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Créés</span>
              <span className="text-lg font-bold text-emerald-700">{commitResult.created}</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-emerald-100 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Mis à jour</span>
              <span className="text-lg font-bold text-blue-700">{commitResult.updated}</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-emerald-100 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Ignorés / Exclus</span>
              <span className="text-lg font-bold text-slate-600">{commitResult.skipped}</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-emerald-100 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">Mouvements créés</span>
              <span className="text-lg font-bold text-slate-800">{commitResult.movements_created}</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. FLUX UNIQUE D'IMPORT : GLISSER-DÉPOSER / CHOISIR UN FICHIER */}
      {!preview && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-sm">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition flex flex-col items-center justify-center cursor-pointer ${
              isDragOver
                ? 'border-emerald-500 bg-emerald-50/40'
                : 'border-slate-200 hover:border-emerald-400 bg-slate-50/50 hover:bg-white'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-emerald-600 mb-4">
              {loading ? (
                <RefreshCw className="w-8 h-8 animate-spin" />
              ) : (
                <Upload className="w-8 h-8" />
              )}
            </div>

            <h3 className="text-base font-bold text-slate-800 mb-1">
              {loading ? loadingStep : 'Glissez votre classeur Excel ici ou cliquez pour choisir'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed mb-4">
              Formats acceptés : <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong> (taille max 5 Mo).
              <br />
              Colonnes requises : <strong>A = Désignation</strong>, <strong>B = Stock initial</strong>, <strong>C = Stock en cours</strong>.
            </p>

            <button
              type="button"
              disabled={loading}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Choisir un fichier sur mon poste</span>
            </button>
          </div>

          <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-3 text-xs text-slate-600">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <strong>Règle de sécurité et d'idempotence :</strong> La désignation de chaque article est normalisée (espaces, casse). L'importation est strictement idempotente : relancer le même classeur met à jour les stocks existants sans créer aucun doublon.
            </div>
          </div>
        </div>
      )}

      {/* 5. TABLEAU D'APERÇU INTERACTIF (APRÈS ANALYSE RÉELLE) */}
      {preview && (
        <div className="space-y-4">
          {/* STATISTIQUES RÉELLES DE L'ANALYSE */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Articles Détectés</div>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{preview.total_rows}</div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">{fileName}</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Stock Positif</div>
              <div className="text-xl font-bold text-emerald-700 mt-0.5">{preview.valid}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Disponibles immédiatement</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-purple-200 bg-purple-50/20 shadow-sm">
              <div className="text-[10px] font-bold text-purple-700 uppercase">Stocks Négatifs</div>
              <div className="text-xl font-bold text-purple-700 mt-0.5">{preview.negative}</div>
              <div className="text-[10px] text-purple-600 mt-0.5">Signalés, jamais masqués</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-sm">
              <div className="text-[10px] font-bold text-amber-700 uppercase">Doublons Détectés</div>
              <div className="text-xl font-bold text-amber-700 mt-0.5">{preview.duplicates}</div>
              <div className="text-[10px] text-amber-600 mt-0.5">Lignes répétées</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Stock Nul (0)</div>
              <div className="text-xl font-bold text-slate-600 mt-0.5">{preview.zero_stock}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Rupture déclarée</div>
            </div>
          </div>

          {/* RÈGLE DES VALEURS NÉGATIVES & DOUBLONS */}
          {(preview.negative > 0 || preview.duplicates > 0) && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <strong>Anomalies détectées : </strong>
                {preview.negative > 0 && (
                  <span>
                    <strong>{preview.negative} article(s) à stock négatif</strong> (importés à 0 avec traçabilité ou exclus selon votre choix).{' '}
                  </span>
                )}
                {preview.duplicates > 0 && (
                  <span>
                    <strong>{preview.duplicates} doublon(s)</strong> (cliquez sur « Exclure les doublons » pour ne conserver que la première occurrence).
                  </span>
                )}
              </div>
            </div>
          )}

          {/* BARRE D'ACTIONS DE L'APERÇU */}
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
              {preview.duplicates > 0 && (
                <button
                  type="button"
                  onClick={handleBatchSkipDuplicates}
                  className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition cursor-pointer"
                >
                  Exclure les doublons
                </button>
              )}
            </div>
          </div>

          {/* BARRE DE PROGRESSION PENDANT LE COMMIT PAR LOTS */}
          {committing && (
            <div className="bg-white p-5 rounded-3xl border border-emerald-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>Envoi par lots de 50 articles vers le serveur CYM Pharma...</span>
                <span className="font-mono text-emerald-700">{commitProgress.percent}% (Lot {commitProgress.current} / {commitProgress.total})</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                  style={{ width: `${commitProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* TABLEAU DES ARTICLES AVEC BADGES DE STATUT */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[460px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-bold sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">Ligne</th>
                    <th className="py-3 px-4">Désignation (Col A)</th>
                    <th className="py-3 px-4">Conditionnement</th>
                    <th className="py-3 px-4 text-center">Stock Initial (B)</th>
                    <th className="py-3 px-4 text-center">Stock En Cours (C)</th>
                    <th className="py-3 px-4 text-center">Action</th>
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
                            ? 'opacity-40'
                            : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-slate-400">
                          #{r.row_index}
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
                        <td className="py-3 px-4 text-center font-mono">
                          {r.stock_opening}
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
                          <select
                            value={r.action}
                            onChange={(e) => updateRowAction(originalIdx, e.target.value as any)}
                            className="text-xs font-semibold rounded-lg px-2 py-1 border border-slate-200 outline-none bg-white cursor-pointer"
                          >
                            <option value="import">Importer</option>
                            <option value="skip">Ignorer</option>
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

          {/* BARRE DE VALIDATION ET BOUTON D'IMPORTATION */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase">
                  Date d'enregistrement des mouvements
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
                disabled={committing}
                onClick={() => setPreview(null)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer disabled:opacity-50"
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
                <span>Valider et Importer dans l'Inventaire ({preview.rows.filter(r => r.action !== 'skip').length} articles)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
