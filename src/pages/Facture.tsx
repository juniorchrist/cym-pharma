import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download, CheckCircle, ShieldCheck, FileText, Layers } from 'lucide-react';
import { storage } from '../utils/storage';
import { Orders } from '../services/api';
import { Order, OrderItem } from '../types';

export const Facture: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('id') || searchParams.get('order_id');

  const [order, setOrder] = useState<Order | null>(() => {
    const cached = storage.getBLCurrentOrder();
    if (cached && (cached.id === orderId || cached.orderNumber === orderId)) {
      return cached;
    }
    return null;
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (orderId) {
      setLoading(true);
      (async () => {
        try {
          const res = await Orders.get(orderId);
          if (res.success && res.data?.order) {
            setOrder(res.data.order);
          } else {
            const phpRes = await Orders.showPhp(orderId);
            if (phpRes.order) {
              setOrder(phpRes.order);
            }
          }
        } catch (err) {
          console.warn('Error loading order for invoice:', err);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [orderId]);

  const rawItems = useMemo(() => {
    return order?.items && order.items.length > 0 ? order.items : [];
  }, [order?.items]);

  const orderNumber = order?.orderNumber || order?.order_number || String(order?.id || '');
  const invoiceNumber = order?.invoice_number || (orderNumber ? `FAC-${orderNumber.replace('CMD-', '')}` : '');

  const formattedDate = (() => {
    const d = order?.invoice_date || order?.priced_at || order?.created_at;
    if (d) {
      const dateObj = new Date(d);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });
      }
    }
    return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  })();

  const clientName =
    order?.establishment_name ||
    (order?.first_name && order?.last_name ? `${order.first_name} ${order.last_name}` : '');

  const fullAddress =
    [order?.shipping_address, order?.shipping_city].filter(Boolean).join(', ') || '';

  const computedTotal = useMemo(() => {
    if (typeof order?.total === 'number' && order.total > 0) {
      return order.total;
    }
    return rawItems.reduce((sum, it) => sum + (it.line_total || ((it.unit_price || it.unitPrice || 0) * (it.quantity || 1))), 0);
  }, [order?.total, rawItems]);

  const handlePrint = () => {
    window.print();
  };

  const isLongList = rawItems.length > 12;

  // Split into 2 columns for long list to fit strictly on single A4
  const midPoint = Math.ceil(rawItems.length / 2);
  const leftColumnItems = isLongList ? rawItems.slice(0, midPoint) : rawItems;
  const rightColumnItems = isLongList ? rawItems.slice(midPoint) : [];

  if (loading) {
    return (
      <div className="bg-[#f1f5f9] min-h-screen flex items-center justify-center py-6 px-4 text-slate-600">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-sm flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-700">Chargement de la facture…</p>
        </div>
      </div>
    );
  }

  // Écran d'état vide si la commande n'est pas trouvée
  if (!order) {
    return (
      <div className="bg-[#f1f5f9] min-h-screen flex flex-col items-center justify-center py-6 px-4 text-slate-600">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center max-w-md">
          <p className="text-lg font-semibold text-slate-700 mb-2">Facture introuvable</p>
          <p className="text-sm text-slate-500 mb-6">
            {orderId
              ? `La commande ${orderId} est introuvable ou la facture n'est pas encore disponible.`
              : 'Aucun identifiant de commande fourni.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard#factures')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0e9f6e] text-white text-sm font-semibold hover:bg-[#057a55] transition"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return (

    <div className="bg-[#f1f5f9] min-h-screen flex flex-col items-center py-6 px-4 print:p-0 print:bg-white text-slate-800">
      {/* ── BARRE D'ACTIONS SUPÉRIEURE (invisible à l'impression) ── */}
      <header className="w-full max-w-[850px] flex flex-wrap items-center justify-between gap-3 mb-5 p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard#factures')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            title="Retour au tableau de bord"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Tableau de bord</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl text-white bg-[var(--primary)] hover:bg-[var(--primary-dark)] shadow-xs transition cursor-pointer"
            title="Imprimer ou enregistrer au format PDF sur 1 seule page A4"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimer / PDF A4</span>
          </button>
        </div>
      </header>

      {/* ── FEUILLE FORMAT A4 DE FACTURE OFFICIELLE (PAGE UNIQUE GARANTIE) ── */}
      {/* Utilise la même police ('Inter', system-ui, -apple-system, sans-serif) et le même conteneur strict que le Bon de Livraison */}
      <main
        id="facture-printable-doc"
        className={`page-a4 relative w-[210mm] max-w-full h-[297mm] min-h-[297mm] max-h-[297mm] bg-white shadow-xl flex flex-col justify-between overflow-hidden box-border mx-auto print:shadow-none print:border-none print:m-0 ${
          isLongList
            ? 'p-[22px_32px_18px_32px] print:p-[18px_28px_14px_28px]'
            : 'p-[28px_40px_22px_40px] print:p-[24px_34px_18px_34px]'
        }`}
        style={{
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Filigrane Logo CYM Pharma */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[65%] pointer-events-none opacity-[0.035] z-[1] flex items-center justify-center select-none"
          aria-hidden="true"
        >
          <img src="/LOGO.png" alt="" className="w-full h-auto object-contain" />
        </div>

        {/* ── CONTENU HAUT & MILIEU ── */}
        <div className="relative z-[2] flex flex-col flex-1 min-h-0">
          {/* 1. EN-TÊTE DE FACTURE */}
          <div className="flex items-start justify-between pb-2.5 border-b-2 border-slate-900 shrink-0">
            <div className="flex items-center gap-3">
              <img src="/LOGO.png" alt="CYM Pharma" className="h-11 w-auto object-contain" />
              <div>
                <p className="text-[10px] font-semibold text-[var(--primary)]">
                  Dispositifs Médicaux &amp; Consommables Hospitaliers B2B
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5">
                  Cocody Riviera 3, Abidjan • Côte d’Ivoire | N° CC : 2039482 B | RCCM : CI-ABJ-2023-B-14920
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block px-2.5 py-0.5 bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-widest rounded">
                FACTURE B2B
              </span>
              <p className="font-bold text-xs text-slate-900 mt-1">
                N° {invoiceNumber}
              </p>
              <p className="text-[10px] text-slate-500">
                Date : {formattedDate}
              </p>
            </div>
          </div>

          {/* 2. BLOC COORDONNÉES CLIENT & RÉFÉRENCES */}
          <div
            className={`grid grid-cols-2 gap-4 rounded-lg bg-slate-50 border border-slate-200 text-xs shrink-0 ${
              isLongList ? 'my-2 p-2.5' : 'my-3 p-3.5'
            }`}
          >
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                Destinataire / Client
              </p>
              <p className="text-xs font-extrabold text-slate-900 leading-tight">
                {clientName}
              </p>
              <p className="text-[10.5px] text-slate-600 mt-0.5">
                {fullAddress}
              </p>
              {order?.shipping_notes && (
                <p className="text-[9.5px] text-slate-500 italic mt-0.5 truncate">
                  Note : {order.shipping_notes}
                </p>
              )}
            </div>

            <div className="border-l border-slate-200 pl-4 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Réf. Commande :</span>
                <span className="font-bold text-slate-900">{orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date commande :</span>
                <span className="font-medium text-slate-800">
                  {order?.created_at ? new Date(order.created_at).toLocaleDateString('fr-FR') : formattedDate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Échéance :</span>
                <span className="font-semibold text-emerald-700">À réception de facture</span>
              </div>
            </div>
          </div>

          {/* 3. TABLEAU DES ARTICLES (ADAPTATIF : 1 COLONNE SI <= 12, 2 COLONNES COMPACTES SI > 12) */}
          {isLongList ? (
            /* ── AFFICHAGE COMPACT 2 COLONNES (POUR JUSQU'À 35-40 ARTICLES SUR 1 SEULE PAGE) ── */
            <div className="grid grid-cols-2 gap-2.5 my-1 flex-1 overflow-hidden">
              {/* Colonne Gauche (Articles 1 à N/2) */}
              <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                <table className="w-full text-left text-[9px] border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[8px] tracking-wider leading-none">
                      <th className="py-1 px-1.5 font-semibold text-center w-5">N°</th>
                      <th className="py-1 px-1.5 font-semibold">Désignation</th>
                      <th className="py-1 px-1 font-semibold text-center w-7">Qté</th>
                      <th className="py-1 px-1 text-right w-12">P.U.</th>
                      <th className="py-1 px-1.5 text-right w-14">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {leftColumnItems.map((item, idx) => {
                      const qty = item.quantity ?? item.qty ?? 1;
                      const unitPrice = item.unit_price ?? item.unitPrice ?? 0;
                      const lineTotal = item.line_total ?? (unitPrice * qty);

                      return (
                        <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                          <td className="py-0.5 px-1.5 text-center text-slate-400 font-bold text-[8.5px]">
                            {idx + 1}
                          </td>
                          <td className="py-0.5 px-1.5">
                            <div className="font-semibold text-slate-900 leading-tight truncate max-w-[130px]">
                              {item.name || item.product_name}
                            </div>
                            <div className="text-[7.5px] text-slate-400 font-medium">
                              {item.conditionnement || item.unit || 'U'}
                            </div>
                          </td>
                          <td className="py-0.5 px-1 text-center font-bold text-slate-900">
                            {qty}
                          </td>
                          <td className="py-0.5 px-1 text-right text-slate-700">
                            {unitPrice > 0 ? unitPrice.toLocaleString('fr-FR') : '—'}
                          </td>
                          <td className="py-0.5 px-1.5 text-right font-bold text-slate-900">
                            {lineTotal > 0 ? lineTotal.toLocaleString('fr-FR') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Colonne Droite (Articles N/2+1 à Fin) */}
              <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                <table className="w-full text-left text-[9px] border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[8px] tracking-wider leading-none">
                      <th className="py-1 px-1.5 font-semibold text-center w-5">N°</th>
                      <th className="py-1 px-1.5 font-semibold">Désignation</th>
                      <th className="py-1 px-1 font-semibold text-center w-7">Qté</th>
                      <th className="py-1 px-1 text-right w-12">P.U.</th>
                      <th className="py-1 px-1.5 text-right w-14">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {rightColumnItems.map((item, idx) => {
                      const realIdx = midPoint + idx;
                      const qty = item.quantity ?? item.qty ?? 1;
                      const unitPrice = item.unit_price ?? item.unitPrice ?? 0;
                      const lineTotal = item.line_total ?? (unitPrice * qty);

                      return (
                        <tr key={realIdx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                          <td className="py-0.5 px-1.5 text-center text-slate-400 font-bold text-[8.5px]">
                            {realIdx + 1}
                          </td>
                          <td className="py-0.5 px-1.5">
                            <div className="font-semibold text-slate-900 leading-tight truncate max-w-[130px]">
                              {item.name || item.product_name}
                            </div>
                            <div className="text-[7.5px] text-slate-400 font-medium">
                              {item.conditionnement || item.unit || 'U'}
                            </div>
                          </td>
                          <td className="py-0.5 px-1 text-center font-bold text-slate-900">
                            {qty}
                          </td>
                          <td className="py-0.5 px-1 text-right text-slate-700">
                            {unitPrice > 0 ? unitPrice.toLocaleString('fr-FR') : '—'}
                          </td>
                          <td className="py-0.5 px-1.5 text-right font-bold text-slate-900">
                            {lineTotal > 0 ? lineTotal.toLocaleString('fr-FR') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ── AFFICHAGE STANDARD 1 COLONNE (POUR LES COMMANDES ORDINAIRES <= 12 ARTICLES) ── */
            <div className="border border-slate-200 rounded-xl overflow-hidden my-2 shrink-0">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                    <th className="py-2 px-3 font-semibold text-center w-10">N°</th>
                    <th className="py-2 px-3 font-semibold">Désignation de l'article</th>
                    <th className="py-2 px-3 font-semibold text-center w-24">Cond.</th>
                    <th className="py-2 px-3 font-semibold text-center w-14">Qté</th>
                    <th className="py-2 px-3 font-semibold text-right w-28">P.U. HT (FCFA)</th>
                    <th className="py-2 px-3 font-semibold text-right w-32">Total HT (FCFA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {rawItems.map((item, idx) => {
                    const qty = item.quantity ?? item.qty ?? 1;
                    const unitPrice = item.unit_price ?? item.unitPrice ?? 0;
                    const lineTotal = item.line_total ?? (unitPrice * qty);

                    return (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                        <td className="py-2 px-3 text-center text-slate-400 font-bold text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {item.name || item.product_name}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-500 text-[11px]">
                          {item.conditionnement || item.unit || 'Boîte'}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-slate-900">{qty}</td>
                        <td className="py-2 px-3 text-right text-slate-700">
                          {unitPrice > 0 ? unitPrice.toLocaleString('fr-FR') : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {lineTotal > 0 ? lineTotal.toLocaleString('fr-FR') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. RÉCAPITULATIF FINANCIER */}
          <div
            className={`grid grid-cols-[1.25fr_1fr] gap-4 items-start shrink-0 ${
              isLongList ? 'mt-1.5' : 'mt-3'
            }`}
          >
            <div className="space-y-1.5">
              <p className={`text-slate-400 leading-tight ${isLongList ? 'text-[8px]' : 'text-[10px]'}`}>
                * Dispositifs médicaux conformes Art. 355 CGI Côte d'Ivoire (exonération TVA consommables vitaux).
              </p>
            </div>

            <div
              className={`bg-slate-50 rounded-lg border border-slate-200 space-y-1 text-slate-600 ${
                isLongList ? 'p-2 text-[10.5px]' : 'p-3 text-xs'
              }`}
            >
              <div className="flex justify-between">
                <span>Total Brut HT :</span>
                <span className="font-semibold text-slate-800">{computedTotal.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between">
                <span>Remise Partenaire B2B :</span>
                <span>0 FCFA</span>
              </div>
              <div className="flex justify-between">
                <span>TVA (0% Médical) :</span>
                <span>0 FCFA</span>
              </div>
              <div className="pt-1.5 border-t border-slate-300 flex justify-between items-baseline">
                <span className="font-extrabold text-slate-900 text-xs">NET À PAYER :</span>
                <span className="font-extrabold text-sm text-[var(--primary)]">
                  {computedTotal.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── BAS DE PAGE & SIGNATURE OFFICIELLE ── */}
        <div
          className={`relative z-[2] border-t border-slate-200 shrink-0 ${
            isLongList ? 'pt-1.5 mt-1.5' : 'pt-3 mt-3'
          }`}
        >
          <div className="grid grid-cols-2 gap-4 items-end mb-2">
            <div className={`text-slate-500 ${isLongList ? 'text-[8.5px]' : 'text-[10px]'}`}>
              <p className="font-bold text-slate-700">Garanties &amp; Conformité :</p>
              <p>Articles conformes aux normes CE / ISO 13485.</p>
              <p>Livraison sécurisée sous température contrôlée à Abidjan.</p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-700">Pour CYM Pharma</p>
              <p className="text-[9px] text-slate-400">Direction Commerciale &amp; Logistique</p>
              <div className="mt-1 inline-block px-3 py-1 border border-dashed border-emerald-600 rounded bg-emerald-50/50">
                <span className="text-[9px] font-extrabold uppercase text-emerald-800 tracking-wider block">
                  CYM PHARMA CI
                </span>
                <span className="text-[8px] text-emerald-700 block font-semibold">
                  FACTURE CERTIFIÉE CONFORME
                </span>
              </div>
            </div>
          </div>

          <p className="text-[8px] text-center text-slate-400">
            CYM Pharma • Cocody Riviera 3, Abidjan • Tél : +225 07 09 55 40 20 • Email : commandes@cympharma.ci
          </p>
        </div>
      </main>
    </div>
  );
};
