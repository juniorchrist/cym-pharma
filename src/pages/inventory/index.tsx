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

export type InventoryTab = 'stock' | 'movements' | 'period' | 'history' | 'import';

export const InventaireIndex: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('stock');

  return (
    <div className="space-y-6">
      {/* HEADER SECTION INVENTAIRE */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Gestion de l'Inventaire &amp; des Stocks B2B
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <ShieldCheck className="w-3 h-3 text-amber-600" />
              Usage Interne Admin — Strictement Confidentiel
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Supervision des stocks réels, enregistrement des flux, comptage physique de fin de mois et historique certifié.
          </p>
        </div>

        {/* NAVIGATION DES ONGLETS */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'stock'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-4 h-4 text-emerald-600" />
            <span>Articles &amp; Stocks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('movements')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'movements'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4 text-blue-600" />
            <span>Mouvements</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('period')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'period'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-4 h-4 text-amber-600" />
            <span>Inventaire Mensuel</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4 text-purple-600" />
            <span>Historique</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeTab === 'import'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-teal-600" />
            <span>Import Classeur</span>
          </button>
        </div>
      </div>

      {/* CONTENU SELON ONGLET */}
      {activeTab === 'stock' && (
        <InventaireStock
          onOpenImport={() => setActiveTab('import')}
          onOpenMovements={() => setActiveTab('movements')}
        />
      )}
      {activeTab === 'movements' && <InventaireMouvements />}
      {activeTab === 'period' && <InventairePeriode />}
      {activeTab === 'history' && <InventaireHistorique />}
      {activeTab === 'import' && (
        <InventaireImport onImportComplete={() => setActiveTab('stock')} />
      )}
    </div>
  );
};
