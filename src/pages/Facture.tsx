import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download, CheckCircle, ShieldCheck, FileText, Layers, Clock, AlertTriangle } from 'lucide-react';
import { Orders } from '../services/api';
import { Order, OrderItem } from '../types';
import { COMPANY } from '../config/company';
import { isPendingQuote } from '../domain/orderStatus';
import { mapOrder } from '../domain/orderMapper';

export const Facture: React.FC = () => {
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = routeId || searchParams.get('id') || searchParams.get('order_id');

  // Toujours initialiser à null pour forcer le chargement de l'état serveur frais
  // Évite l'affichage d'un instantané périmé (sans prix) conservé dans sessionStorage
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orderId) {
      setLoading(true);
      (async () => {
        try {
          const res = await Orders.get(orderId);
          if (res.success && res.data?.order) {
            setOrder(mapOrder(res.data.order));
          } else {
            const phpRes = await Orders.showPhp(orderId);
            if (phpRes.order) {
              setOrder(mapOrder(phpRes.order));
            }
          }
        } catch (err) {
          console.warn('Error loading order for invoice:', err);
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
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

  const formattedOrderDateTime = (() => {
    const d = order?.created_at;
    if (d) {
      const dateObj = new Date(d);
      if (!isNaN(dateObj.getTime())) {
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const yyyy = dateObj.getFullYear();
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} à ${hh}:${min}`;
      }
    }
    return formattedDate;
  })();

  const clientName =
    order?.establishment_name ||
    (order?.first_name && order?.last_name ? `${order.first_name} ${order.last_name}` : '');

  const fullAddress = useMemo(() => {
    const rawParts = [order?.shipping_address, order?.shipping_city].filter(Boolean) as string[];
    if (rawParts.length === 0) return COMPANY.city;
    if (rawParts.length === 2 && rawParts[0].toLowerCase().includes(rawParts[1].toLowerCase())) {
      return rawParts[0];
    }
    return rawParts.join(', ');
  }, [order?.shipping_address, order?.shipping_city]);

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

  // Si la commande n'a pas encore été chiffrée par l'administrateur,
  // la facture définitive avec montants n'est pas disponible (règle anti 0 FCFA).
  if (isPendingQuote(order.status) || (!order.total && computedTotal === 0)) {
    return (
      <div className="bg-[#f1f5f9] min-h-screen flex flex-col items-center justify-center py-6 px-4 text-slate-700">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-md space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Facture disponible après chiffrage.</h2>
            <p className="text-xs text-slate-500 mt-1">
              La commande <strong className="font-mono text-slate-700">{orderNumber}</strong> est en attente de chiffrage par notre équipe commerciale.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Le document officiel avec les prix unitaires et le net à payer sera accessible dès confirmation des tarifs par l'administrateur.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => navigate('/dashboard#commandes')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
            >
              Voir mes commandes
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-400 text-xs font-semibold bg-slate-50 cursor-not-allowed opacity-60"
              title="Facture disponible après chiffrage."
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer (Désactivé)</span>
            </button>
          </div>
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
        className={`page-a4 relative w-full max-w-[850px] print:w-[210mm] print:max-w-none h-auto min-h-0 sm:min-h-[297mm] print:h-[297mm] print:min-h-[297mm] print:max-h-[297mm] bg-white shadow-xl flex flex-col justify-between overflow-visible print:overflow-hidden box-border mx-auto print:shadow-none print:border-none print:m-0 rounded-2xl print:rounded-none ${
          isLongList
            ? 'p-3.5 sm:p-5 md:p-[22px_32px_18px_32px] print:p-[18px_28px_14px_28px]'
            : 'p-4 sm:p-7 md:p-[28px_40px_22px_40px] print:p-[24px_34px_18px_34px]'
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
          <div className="flex flex-col sm:flex-row print:flex-row items-start justify-between pb-2.5 border-b-2 border-slate-900 shrink-0 gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/LOGO.png"
                alt={COMPANY.name}
                className="h-[38px] sm:h-[46px] w-auto max-w-[150px] sm:max-w-[190px] object-contain object-left shrink-0"
              />
              <div>
                <p className="text-[10px] font-semibold text-[var(--primary)] leading-tight">
                  {COMPANY.tagline || 'Dispositifs Médicaux & Consommables Hospitaliers B2B'}
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5 leading-snug">
                  {[
                    COMPANY.address,
                    COMPANY.taxId ? `N° CC : ${COMPANY.taxId}` : null,
                    COMPANY.registrationNumber ? `RCCM : ${COMPANY.registrationNumber}` : null,
                  ].filter(Boolean).join(' | ')}
                </p>
              </div>
            </div>

            <div className="w-full sm:w-auto print:w-auto flex sm:flex-col print:flex-col items-center sm:items-end print:items-end justify-between sm:justify-start gap-1">
              <span className="inline-block px-2.5 py-0.5 bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-widest rounded whitespace-nowrap">
                FACTURE B2B
              </span>
              <p className="font-bold text-xs text-slate-900 mt-0.5 whitespace-nowrap">
                N° {invoiceNumber}
              </p>
              <p className="text-[10px] text-slate-500 whitespace-nowrap">
                Date : {formattedDate}
              </p>
            </div>
          </div>

          {/* 2. BLOC COORDONNÉES CLIENT & RÉFÉRENCES */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 sm:gap-4 rounded-xl bg-slate-50 border border-slate-200 text-xs shrink-0 ${
              isLongList ? 'my-2 p-2.5 sm:p-3' : 'my-2.5 sm:my-3 p-3 sm:p-3.5'
            }`}
          >
            <div className="space-y-0.5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Destinataire / Client
              </p>
              <p className="text-xs sm:text-[13px] font-extrabold text-slate-900 leading-snug">
                {clientName}
              </p>
              <p className="text-[10.5px] text-slate-600 mt-0.5 leading-relaxed">
                {fullAddress}
              </p>
              {order?.shipping_notes && (
                <p className="text-[9.5px] text-slate-500 italic mt-0.5">
                  Note : {order.shipping_notes}
                </p>
              )}
            </div>

            <div className="border-t pt-2.5 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-4 print:border-l print:border-t-0 print:pl-4 border-slate-200 space-y-1.5 text-[11px]">
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Réf. Commande :</span>
                <span className="font-bold text-slate-900 font-ref text-right">{orderNumber}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Date commande :</span>
                <span className="font-medium text-slate-800 text-right">{formattedOrderDateTime}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Échéance :</span>
                <span className="font-semibold text-emerald-700 text-right">À réception de facture</span>
              </div>
            </div>
          </div>

          {/* 3. TABLEAU DES ARTICLES (ADAPTATIF : 1 COLONNE SI <= 12, 2 COLONNES COMPACTES SI > 12) */}
          {isLongList ? (
            /* ── AFFICHAGE COMPACT 2 COLONNES (POUR JUSQU'À 35-40 ARTICLES SUR 1 SEULE PAGE) ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-2.5 my-1 flex-1 overflow-x-auto print:overflow-hidden">
              {/* Colonne Gauche (Articles 1 à N/2) */}
              <div className="border border-slate-200 rounded-lg overflow-x-auto print:overflow-hidden flex flex-col">
                <table className="w-full text-left text-[9px] border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[8px] tracking-wider leading-none whitespace-nowrap">
                      <th className="py-1 px-1.5 font-semibold text-center w-5">N°</th>
                      <th className="py-1 px-1.5 font-semibold">Désignation</th>
                      <th className="py-1 px-1 font-semibold text-center w-7">Qté</th>
                      <th className="hidden sm:table-cell print:table-cell py-1 px-1 text-right w-12">P.U.</th>
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
                          <td className="py-0.5 px-1.5 text-center text-slate-400 font-bold text-[8.5px] whitespace-nowrap">
                            {idx + 1}
                          </td>
                          <td className="py-0.5 px-1.5">
                            <div className="font-semibold text-slate-900 leading-tight truncate max-w-[140px]">
                              {item.name || item.product_name}
                            </div>
                            <div className="text-[7.5px] text-slate-400 font-medium">
                              {item.conditionnement || item.unit || 'U'}
                            </div>
                          </td>
                          <td className="py-0.5 px-1 text-center font-bold text-slate-900 whitespace-nowrap">
                            {qty}
                          </td>
                          <td className="hidden sm:table-cell print:table-cell py-0.5 px-1 text-right text-slate-700 whitespace-nowrap font-mono">
                            {unitPrice > 0 ? unitPrice.toLocaleString('fr-FR') : '—'}
                          </td>
                          <td className="py-0.5 px-1.5 text-right font-bold text-slate-900 whitespace-nowrap font-mono">
                            {lineTotal > 0 ? lineTotal.toLocaleString('fr-FR') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Colonne Droite (Articles N/2+1 à Fin) */}
              <div className="border border-slate-200 rounded-lg overflow-x-auto print:overflow-hidden flex flex-col">
                <table className="w-full text-left text-[9px] border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[8px] tracking-wider leading-none whitespace-nowrap">
                      <th className="py-1 px-1.5 font-semibold text-center w-5">N°</th>
                      <th className="py-1 px-1.5 font-semibold">Désignation</th>
                      <th className="py-1 px-1 font-semibold text-center w-7">Qté</th>
                      <th className="hidden sm:table-cell print:table-cell py-1 px-1 text-right w-12">P.U.</th>
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
                          <td className="py-0.5 px-1.5 text-center text-slate-400 font-bold text-[8.5px] whitespace-nowrap">
                            {realIdx + 1}
                          </td>
                          <td className="py-0.5 px-1.5">
                            <div className="font-semibold text-slate-900 leading-tight truncate max-w-[140px]">
                              {item.name || item.product_name}
                            </div>
                            <div className="text-[7.5px] text-slate-400 font-medium">
                              {item.conditionnement || item.unit || 'U'}
                            </div>
                          </td>
                          <td className="py-0.5 px-1 text-center font-bold text-slate-900 whitespace-nowrap">
                            {qty}
                          </td>
                          <td className="hidden sm:table-cell print:table-cell py-0.5 px-1 text-right text-slate-700 whitespace-nowrap font-mono">
                            {unitPrice > 0 ? unitPrice.toLocaleString('fr-FR') : '—'}
                          </td>
                          <td className="py-0.5 px-1.5 text-right font-bold text-slate-900 whitespace-nowrap font-mono">
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
            <div className="border border-slate-200 rounded-xl overflow-hidden print:overflow-visible my-2 shrink-0">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[9px] sm:text-[10px] tracking-wider whitespace-nowrap">
                    <th className="py-2 px-2 sm:px-3 font-semibold text-center w-7 sm:w-10">N°</th>
                    <th className="py-2 px-2 sm:px-3 font-semibold">Désignation de l'article</th>
                    <th className="hidden sm:table-cell print:table-cell py-2 px-2 sm:px-3 font-semibold text-center w-20 sm:w-24">Cond.</th>
                    <th className="py-2 px-1.5 sm:px-3 font-semibold text-center w-9 sm:w-14">Qté</th>
                    <th className="hidden sm:table-cell print:table-cell py-2 px-2 sm:px-3 font-semibold text-right w-20 sm:w-28">P.U. HT</th>
                    <th className="py-2 px-2 sm:px-3 font-semibold text-right w-20 sm:w-32">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {rawItems.map((item, idx) => {
                    const qty = item.quantity ?? item.qty ?? 1;
                    const unitPrice = item.unit_price ?? item.unitPrice ?? 0;
                    const lineTotal = item.line_total ?? (unitPrice * qty);

                    return (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                        <td className="py-2 px-2 sm:px-3 text-center text-slate-400 font-bold text-[10px] sm:text-[11px] whitespace-nowrap">{idx + 1}</td>
                        <td className="py-2 px-2 sm:px-3 font-medium text-slate-900">
                          <div>{item.name || item.product_name}</div>
                          <div className="sm:hidden print:hidden text-[9px] text-slate-400 font-normal mt-0.5">
                            {item.conditionnement || item.unit || 'Boîte'}
                            {unitPrice > 0 && ` • P.U: ${unitPrice.toLocaleString('fr-FR')} F`}
                          </div>
                        </td>
                        <td className="hidden sm:table-cell print:table-cell py-2 px-2 sm:px-3 text-center text-slate-500 text-[11px] whitespace-nowrap">
                          {item.conditionnement || item.unit || 'Boîte'}
                        </td>
                        <td className="py-2 px-1.5 sm:px-3 text-center font-bold text-slate-900 whitespace-nowrap">{qty}</td>
                        <td className="hidden sm:table-cell print:table-cell py-2 px-2 sm:px-3 text-right text-slate-700 whitespace-nowrap font-mono">
                          {unitPrice > 0 ? unitPrice.toLocaleString('fr-FR') : '—'}
                        </td>
                        <td className="py-2 px-2 sm:px-3 text-right font-bold text-slate-900 whitespace-nowrap font-mono">
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
            className={`grid grid-cols-1 sm:grid-cols-[1.25fr_1fr] print:grid-cols-[1.25fr_1fr] gap-3 sm:gap-4 items-start shrink-0 ${
              isLongList ? 'mt-1.5' : 'mt-2.5 sm:mt-3'
            }`}
          >
            <div className="space-y-1.5 order-2 sm:order-1 print:order-1">
              <p className={`text-slate-400 leading-tight ${isLongList ? 'text-[8px]' : 'text-[10px]'}`}>
                * Dispositifs médicaux conformes Art. 355 CGI Côte d'Ivoire. Facture établie sur la base des prix chiffrés et validés par CYM Pharma SARL.
              </p>
            </div>

            <div
              className={`bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-slate-600 order-1 sm:order-2 print:order-2 ${
                isLongList ? 'p-2 text-[10.5px]' : 'p-3 sm:p-3.5 text-xs'
              }`}
            >
              <div className="flex justify-between items-center gap-2">
                <span className="shrink-0">Total Brut HT :</span>
                <span className="font-semibold text-slate-800 text-right whitespace-nowrap">{computedTotal.toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="pt-2 border-t border-slate-300 flex justify-between items-baseline gap-2">
                <span className="font-extrabold text-slate-900 text-xs shrink-0">NET À PAYER :</span>
                <span className="font-extrabold text-sm sm:text-base text-[var(--primary)] text-right whitespace-nowrap">
                  {computedTotal.toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── BAS DE PAGE & SIGNATURE OFFICIELLE ── */}
        <div
          className={`relative z-[2] border-t border-slate-200 shrink-0 ${
            isLongList ? 'pt-1.5 mt-1.5' : 'pt-2.5 sm:pt-3 mt-2.5 sm:mt-3'
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 sm:gap-4 items-end mb-2">
            <div className={`text-slate-500 ${isLongList ? 'text-[8.5px]' : 'text-[10px]'}`}>
              <p className="font-bold text-slate-700">Conditions &amp; Livraison :</p>
              <p>Livraison sur site client ou enlèvement selon accord commercial.</p>
              <p>Règlement à réception de facture selon conditions convenues.</p>
            </div>

            <div className="text-left sm:text-right print:text-right">
              <p className="text-[10px] font-bold text-slate-700">Pour {COMPANY.name}</p>
              <p className="text-[9px] text-slate-400">Direction Commerciale &amp; Logistique</p>
              <div className="mt-1 inline-block px-3 py-1 border border-dashed border-emerald-600 rounded bg-emerald-50/50">
                <span className="text-[9px] font-extrabold uppercase text-emerald-800 tracking-wider block">
                  {COMPANY.name.toUpperCase()}
                </span>
                <span className="text-[8px] text-emerald-700 block font-semibold">
                  DOCUMENT COMMERCIAL OFFICIEL
                </span>
              </div>
            </div>
          </div>

          <p className="text-[8px] text-center text-slate-400">
            {[
              COMPANY.name,
              COMPANY.address,
              COMPANY.phone ? `Tél : ${COMPANY.phone}` : null,
              COMPANY.email ? `Email : ${COMPANY.email}` : null,
            ].filter(Boolean).join(' • ')}
          </p>
        </div>
      </main>
    </div>
  );
};
