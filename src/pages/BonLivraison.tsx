import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import { storage } from '../utils/storage';
import { Orders } from '../services/api';
import { Order } from '../types';

export const BonLivraison: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('id') || searchParams.get('order_id');

  const [order, setOrder] = useState<Order>(() => {
    // 1. Check session storage cache
    const cached = storage.getBLCurrentOrder();
    if (cached) return cached;

    // 2. Default reference model (Clinique IRYS) as specified in bon-livraison.html
    return {
      id: 'CMD-2026-8842',
      orderNumber: 'CMD-2026-8842',
      created_at: '2026-09-18T09:30:00Z',
      establishment_name: 'Clinique IRYS',
      shipping_address: 'Koumassi Prodomo, dessus Phie Mesano',
      shipping_city: 'Koumassi, Abidjan',
      status: 'delivered',
      item_count: 1,
      items: [
        {
          name: 'GANT PROPRE M B/100',
          product_name: 'GANT PROPRE M B/100',
          product_ref: 'GLV-NIT-01',
          quantity: 50,
          qty: 50,
        },
      ],
    };
  });

  useEffect(() => {
    if (orderId) {
      (async () => {
        try {
          const res = await Orders.showPhp(orderId);
          if (res.order) {
            setOrder(res.order);
          }
        } catch {
          // Keep cached or default
        }
      })();
    }
  }, [orderId]);

  // Date format jj/mm/aaaa
  const formattedDate = (() => {
    if (order.created_at) {
      const d = new Date(order.created_at);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
    }
    return '18/09/2026';
  })();

  const clientName =
    order.establishment_name ||
    (order.first_name && order.last_name ? `${order.first_name} ${order.last_name}` : 'Clinique IRYS');

  const fullAddress =
    [order.shipping_address, order.shipping_city, order.shipping_notes]
      .filter(Boolean)
      .join(', ') || 'Koumassi Prodomo, dessus Phie Mesano';

  const orderItems = order.items && order.items.length > 0 ? order.items : [
    { name: 'GANT PROPRE M B/100', product_name: 'GANT PROPRE M B/100', quantity: 50, qty: 50 }
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-[#f1f5f9] min-h-screen flex flex-col items-center py-6 px-4 print:p-0 print:bg-white">
      {/* ── BARRE D'ACTIONS SUPÉRIEURE (invisible à l'impression) ── */}
      <header className="action-bar w-full max-w-[820px] flex items-center justify-between gap-3 mb-5 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="action-btn action-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            title="Retourner à la page précédente"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour</span>
          </button>
          <div className="brand-badge inline-flex items-center gap-2 text-xs font-bold text-[var(--primary)] pl-2 border-l border-slate-200">
            <img src="/LOGO.png" alt="CYM Pharma" className="h-6 w-auto object-contain" />
            <span>Générateur de Bon de Livraison officiel</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="action-btn action-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl text-white bg-[var(--primary)] hover:bg-[var(--primary-dark)] transition cursor-pointer shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimer / PDF</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="action-btn action-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            title="Télécharger le document"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter</span>
          </button>
        </div>
      </header>

      {/* ── FEUILLE FORMAT A4 DU BON DE LIVRAISON ── */}
      <main
        id="bl-printable-doc"
        className="page-a4 relative w-[210mm] max-w-full h-[297mm] min-h-[297mm] max-h-[297mm] bg-white shadow-xl p-[30px_42px_24px_50px] flex flex-col justify-between overflow-hidden box-border mx-auto print:shadow-none print:border-none print:m-0 print:p-[24px_38px_20px_48px]"
      >
        {/* Triple structure verticale cyan à gauche */}
        <div
          className="vertical-decor-lines absolute top-[52px] bottom-[60px] left-[24px] w-[16px] flex gap-[4px] pointer-events-none z-[2]"
          aria-hidden="true"
        >
          <div className="v-line w-[2px] h-full bg-[#00BFD3] rounded-[1px]"></div>
          <div className="v-line w-[2px] h-full bg-[#00BFD3] rounded-[1px]"></div>
          <div className="v-line w-[2px] h-full bg-[#00BFD3] rounded-[1px]"></div>
        </div>

        {/* Filigrane Logo CYM Pharma centré */}
        <div
          className="bl-watermark-container absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[75%] pointer-events-none opacity-10 z-[1] flex items-center justify-center"
          aria-hidden="true"
        >
          <img src="/LOGO.png" alt="CYM Pharma Filigrane" className="w-full h-auto object-contain" />
        </div>

        {/* EN-TÊTE DU DOCUMENT */}
        <header className="bl-top-header relative z-[3] shrink-0">
          <div className="bl-header flex items-start justify-between">
            <div className="bl-logo-wrap">
              <img src="/LOGO.png" alt="CYM Pharma" className="h-[56px] w-auto object-contain" />
            </div>
            <div className="bl-header-baseline text-[14px] font-medium text-slate-900 mt-[14px] tracking-tight">
              Matériel médical &amp; Consommables
            </div>
          </div>
          <div className="bl-header-line w-full h-[4px] bg-[#00BFD3] mt-[12px] mb-0 relative z-[3]"></div>
        </header>

        {/* SECTION CENTRALE */}
        <div className="bl-main-invoice-body flex-1 flex flex-col justify-center relative z-[3] min-h-0 py-4">
          {/* Bloc d'identification */}
          <div className="bl-meta-grid grid grid-cols-[1fr_1.25fr] gap-x-8 gap-y-3 mb-5 text-[14px]">
            <div>
              <h1 className="bl-title font-sans text-[16px] font-extrabold text-black tracking-wide">
                BON DE LIVRAISON
              </h1>
              <div className="bl-client-field font-bold text-black mt-3.5 leading-tight">
                Client : <span id="bl-client-name">{clientName}</span>
              </div>
            </div>
            <div>
              <div className="bl-date-field font-bold text-black text-right">
                Date : <span id="bl-date">{formattedDate}</span>
              </div>
              <div className="bl-address-field font-bold text-black text-right mt-3.5 leading-tight">
                Adresse : <span id="bl-client-address">{fullAddress}</span>
              </div>
            </div>
          </div>

          {/* Table des articles */}
          <div className="bl-table-container relative z-[4] mb-6">
            <table className="bl-table w-full border-collapse text-[13.5px] bg-transparent">
              <thead>
                <tr>
                  <th className="col-num w-[55px] text-center border-[1.5px] border-slate-800 p-2 bg-white/90 font-bold text-black">
                    N°
                  </th>
                  <th className="col-desc text-center border-[1.5px] border-slate-800 p-2 bg-white/90 font-bold text-black">
                    Désignations Articles
                  </th>
                  <th className="col-qty w-[120px] text-center border-[1.5px] border-slate-800 p-2 bg-white/90 font-bold text-black">
                    Quantités
                  </th>
                </tr>
              </thead>
              <tbody id="bl-items-tbody">
                {orderItems.map((item, idx) => {
                  const designation = (item.product_name || item.name || 'Article Médical').toUpperCase();
                  const ref = item.product_ref || item.reference ? ` (${item.product_ref || item.reference})` : '';
                  const q = item.quantity ?? item.qty ?? 1;

                  return (
                    <tr key={idx}>
                      <td className="col-num text-center font-bold border-[1.5px] border-slate-800 p-2">
                        {idx + 1}
                      </td>
                      <td className="col-desc text-left font-bold tracking-wide border-[1.5px] border-slate-800 p-2">
                        {designation}
                        {ref}
                      </td>
                      <td className="col-qty text-center font-bold text-[14px] border-[1.5px] border-slate-800 p-2">
                        {q}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Signatures Client et Responsable */}
          <div className="bl-signatures flex justify-between mt-2 mb-0 relative z-[4] text-[14px]">
            <div className="bl-sign-box client w-[280px] leading-relaxed">
              <p className="bl-sign-title font-bold underline mb-1.5 text-black">Le Client</p>
              <p className="bl-sign-field font-medium text-slate-800">Signature :</p>
              <p className="bl-sign-field font-medium text-slate-800">Cachet :</p>
              <p className="bl-sign-field font-medium text-slate-800">Date :</p>
            </div>

            <div className="bl-sign-box responsable w-[220px] text-right">
              <p className="bl-sign-title font-bold underline text-black">Le Responsable</p>
            </div>
          </div>
        </div>

        {/* Pied de page officiel CYM Pharma */}
        <footer className="bl-footer-wrap relative z-[4] mt-auto shrink-0">
          <div className="bl-footer-line w-full h-[1px] bg-[#38bdf8] mb-2.5"></div>
          <div className="bl-footer-text text-center text-[10.5px] leading-relaxed text-slate-800 font-medium">
            <p className="bl-footer-line1 mb-0.5">
              CYM Pharma SARLU au capital de 1.000.000FCFA – Abidjan Port-Bouët, face Cité Policière
            </p>
            <p className="bl-footer-line2 mb-0.5">
              RCCM : CI-ABJ-03-2023-B13-04205 &nbsp;&nbsp; CC : 2301843 U &nbsp;&nbsp; Régime d’Imposition : TEE &nbsp;&nbsp; CDI : Port-Bouët/Vridi
            </p>
            <p className="bl-footer-line3 flex items-center justify-center gap-4 flex-wrap">
              <span>📞 : (00225) 0555 20 3030 / 070707 97 46 / 05 94 84 1818</span>
              <span>cympharma25@gmail.com</span>
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};
