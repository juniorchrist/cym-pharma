import React, { useState } from 'react';
import {
  Boxes,
  ArrowLeftRight,
  ClipboardList,
  History,
  FileSpreadsheet,
  ShieldCheck,
} from 'lucide-react';
import { InventaireStock } from './InventaireStock';
import { InventaireMouvements } from './InventaireMouvements';
import { InventairePeriode } from './InventairePeriode';
import { InventaireHistorique } from './InventaireHistorique';
import { InventaireImport } from './InventaireImport';

export type InventoryTab = 'stock' | 'period' | 'import';

export const InventaireIndex: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('stock');

  return (
    <div className="space-y-4">
      {/* 1. EN-TÊTE PRINCIPAL */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Gestion de l'Inventaire &amp; des Stocks B2B
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              Usage Interne Admin — Strictement Confidentiel
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Consultez les stocks de tous les produits, suivez le bilan mensuel et importez votre fichier Excel.
          </p>
        </div>
      </div>

      {/* 2. ONGLETS SOUS LE TITRE — 3 RUBRIQUES VISIBLES UNIQUEMENT */}
      <div className="w-full bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-1.5 overflow-x-auto md:overflow-visible">
        <button
          type="button"
          onClick={() => setActiveTab('stock')}
          className={`flex-1 min-w-[130px] md:min-w-0 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'stock'
              ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <Boxes className={`w-4 h-4 ${activeTab === 'stock' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Articles &amp; Stocks</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('period')}
          className={`flex-1 min-w-[130px] md:min-w-0 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'period'
              ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <ClipboardList className={`w-4 h-4 ${activeTab === 'period' ? 'text-amber-400' : 'text-slate-500'}`} />
          <span>Bilan mensuel</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('import')}
          className={`flex-1 min-w-[130px] md:min-w-0 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            activeTab === 'import'
              ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
        >
          <FileSpreadsheet className={`w-4 h-4 ${activeTab === 'import' ? 'text-teal-400' : 'text-slate-500'}`} />
          <span>Importer un fichier Excel</span>
        </button>
      </div>

      {/* 3. CONTENU DE L'ONGLET SÉLECTIONNÉ */}
      {activeTab === 'stock' && (
        <InventaireStock
          onOpenImport={() => setActiveTab('import')}
        />
      )}
      {activeTab === 'period' && <InventairePeriode onOpenImport={() => setActiveTab('import')} />}
      {activeTab === 'import' && (
        <InventaireImport onImportComplete={() => setActiveTab('stock')} />
      )}
    </div>
  );
};
