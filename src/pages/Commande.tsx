import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Package,
  Plus,
  Clock,
  CheckCircle2,
  FileCheck,
  ShoppingBag,
  Send,
  Loader2,
  Building2,
  MapPin,
  Info,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Orders } from '../services/api';
import { storage } from '../utils/storage';

export const Commande: React.FC = () => {
  const { user } = useAuth();
  const { items, count, updateQty, remove, clear } = useCart();
  const { showToast } = useToast();

  const [establishmentName, setEstablishmentName] = useState(
    user?.establishment_name || user?.org || ''
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    user?.commune ? `Abidjan, ${user.commune}` : 'Abidjan, Cocody'
  );
  const [orderNotes, setOrderNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState('');

  const totalCount = count();

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      showToast('Votre panier est vide.', 'warning');
      return;
    }

    setLoading(true);

    const payload = {
      items: items.map((item) => ({
        productId: item.id,
        name: item.name,
        reference: item.reference,
        unit: item.unit || item.conditionnement,
        quantity: item.qty,
      })),
      establishment_name: establishmentName.trim(),
      shipping: { method: 'standard' },
      payment: { method: 'sur_devis' },
      shippingAddress: {
        street: deliveryAddress.trim(),
        city: 'Abidjan' as const,
        notes: orderNotes.trim(),
      },
      notes: orderNotes.trim(),
    };

    try {
      const res = await Orders.create(payload as any);

      if (!res.success || !res.data?.order) {
        showToast(res.message || 'Impossible d\'enregistrer la commande. Veuillez vérifier la connexion au serveur.', 'error');
        return;
      }

      const createdOrder = res.data.order;
      const orderNumber = createdOrder.orderNumber || createdOrder.order_number || String(createdOrder.id);
      setConfirmedOrderNumber(orderNumber);

      // Enregistrer la vraie commande validée en session pour l'impression immédiate du Bon de Livraison
      storage.setBLCurrentOrder({
        id: orderNumber,
        order_number: orderNumber,
        orderNumber,
        created_at: createdOrder.created_at || new Date().toISOString(),
        status: createdOrder.status || 'À chiffrer',
        establishment_name: establishmentName.trim(),
        shipping_address: deliveryAddress.trim(),
        shipping_city: 'Abidjan',
        shipping_notes: orderNotes.trim(),
        item_count: items.length,
        items: items.map((it) => ({
          name: it.name,
          product_name: it.name,
          product_ref: it.reference,
          reference: it.reference,
          qty: it.qty,
          quantity: it.qty,
          unit: it.unit || it.conditionnement,
        })),
        total: null,
      });

      clear();
      setIsSubmitted(true);
      showToast(`Commande envoyée avec succès (Statut : À chiffrer) → ${orderNumber}`, 'success');
      window.scrollTo({ top: 100, behavior: 'smooth' });
    } catch (err: any) {
      console.error('[Commande] Erreur lors de la transmission :', err);
      showToast(err?.message || 'Erreur technique lors de la transmission de la commande.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <div className="relative w-full px-4 sm:px-6 pt-28 pb-16">
        <div className="mx-auto w-full max-w-5xl">
          {/* CONFIRMATION SCREEN */}
          {isSubmitted ? (
            <div className="card p-8 sm:p-10 text-center space-y-6 max-w-2xl mx-auto">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-9 h-9" strokeWidth={2.5} />
              </div>

              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Statut : À chiffrer</span>
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  Demande de commande transmise avec succès !
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                  Votre demande a été enregistrée et transmise à notre pôle tarification CYM Pharma Abidjan.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 inline-block">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Référence du bon de commande
                </p>
                <p id="confirmed-order-number" className="text-2xl font-mono font-extrabold text-[var(--primary)] mt-1">
                  {confirmedOrderNumber}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100 text-left text-xs text-slate-600 space-y-2 max-w-lg mx-auto">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <Info className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <span>Processus de chiffrage B2B</span>
                </div>
                <p className="leading-relaxed">
                  Conformément à la réglementation des dispositifs médicaux et équipements en Côte d'Ivoire, les tarifs de référence sont appliqués et validés par notre administration. Vous recevrez votre facture officielle chiffrée directement dans votre espace client dès validation.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
                <Link to="/dashboard" className="btn-primary flex items-center justify-center gap-2">
                  <Clock className="w-4 h-4" strokeWidth={2} />
                  <span>Suivre mes commandes</span>
                </Link>
                <Link to="/catalogue" className="btn-secondary">
                  <span>Retour au catalogue</span>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* EN-TÊTE TUNNEL DE COMMANDE SANS PRIX */}
              <div className="mb-8">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[var(--primary-tint)] text-[var(--primary)] mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
                  <span>Validation du Bon de Commande B2B</span>
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  Récapitulatif de votre demande
                </h1>
                <p className="text-slate-500 text-xs sm:text-sm mt-1">
                  Vérifiez vos articles et leurs quantités avant l'envoi pour chiffrage par l'administration CYM Pharma.
                </p>
              </div>

              <form onSubmit={handleSendOrder} className="grid gap-8 lg:grid-cols-3 items-start">
                {/* COLONNE GAUCHE (2 colonnes) : LISTE DES ARTICLES */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Carte des articles */}
                  <div className="card p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Package className="w-4 h-4 text-[var(--primary)]" strokeWidth={2} />
                        <span>Articles commandés ({totalCount})</span>
                      </h2>
                      <Link
                        to="/catalogue"
                        className="text-xs font-semibold text-[var(--primary)] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                        <span>Ajouter d'autres produits</span>
                      </Link>
                    </div>

                    {items.length === 0 ? (
                      <div id="empty-cart-msg" className="text-center py-12 space-y-3">
                        <ShoppingBag className="mx-auto text-slate-300 w-12 h-12" strokeWidth={1.5} />
                        <p className="text-sm font-semibold text-slate-700">Votre panier est vide</p>
                        <p className="text-xs text-slate-400">
                          Consultez notre catalogue pour ajouter vos consommables médicaux.
                        </p>
                        <Link to="/catalogue" className="btn-primary mt-2 inline-flex">
                          Découvrir le catalogue
                        </Link>
                      </div>
                    ) : (
                      <div id="order-items-list" className="space-y-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3.5 rounded-xl border border-slate-100 flex items-center justify-between gap-3 bg-slate-50/80 hover:bg-slate-50 transition"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                                {item.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => updateQty(item.id, -1)}
                                    aria-label="Diminuer la quantité"
                                    className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold hover:bg-slate-100 text-slate-700 cursor-pointer"
                                  >
                                    −
                                  </button>
                                  <span className="text-xs font-bold px-2 text-slate-900">
                                    {item.qty}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => updateQty(item.id, 1)}
                                    aria-label="Augmenter la quantité"
                                    className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold hover:bg-slate-100 text-slate-700 cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>

                                {item.reference && (
                                  <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                                    Réf. {item.reference}
                                  </span>
                                )}
                                {(item.conditionnement || item.unit) && (
                                  <span className="text-[10px] text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                                    {item.conditionnement || item.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <button
                                type="button"
                                onClick={() => remove(item.id)}
                                className="text-[11px] font-medium text-red-500 hover:text-red-700 hover:underline cursor-pointer"
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Coordonnées & Destination de la structure */}
                  <div className="card p-6 space-y-4">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[var(--primary)]" strokeWidth={2} />
                      <span>Établissement &amp; Destination de livraison</span>
                    </h2>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="establishment-input" className="block text-xs font-semibold text-slate-700 mb-1">
                          Nom de la structure / Clinique / Pharmacie *
                        </label>
                        <input
                          id="establishment-input"
                          type="text"
                          required
                          value={establishmentName}
                          onChange={(e) => setEstablishmentName(e.target.value)}
                          placeholder="Ex: Clinique Sainte-Marie"
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[var(--primary)] focus:bg-white transition"
                        />
                      </div>
                      <div>
                        <label htmlFor="address-input" className="block text-xs font-semibold text-slate-700 mb-1">
                          Commune &amp; Adresse de livraison (Abidjan) *
                        </label>
                        <input
                          id="address-input"
                          type="text"
                          required
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Ex: Abidjan, Cocody Boulevard de France"
                          className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[var(--primary)] focus:bg-white transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="order-notes-input" className="block text-xs font-semibold text-slate-700 mb-1">
                        Instructions particulières ou référence interne de bon d'achat (optionnel)
                      </label>
                      <input
                        id="order-notes-input"
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Ex: Bon de commande interne BC-2026-90 — Service Réanimation"
                        className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-[var(--primary)] focus:bg-white transition"
                      />
                    </div>
                  </div>
                </div>

                {/* COLONNE DROITE : RÉSUMÉ & TRANSMISSION COMMANDE */}
                <div className="card p-6 space-y-5 sticky top-24">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-[var(--primary)]" strokeWidth={2} />
                    <span>Récapitulatif B2B</span>
                  </h3>

                  {/* Nombre d'articles */}
                  <div className="flex justify-between items-center py-2 border-b border-slate-100 text-xs">
                    <span className="text-slate-500">Nombre d'articles distincts</span>
                    <span className="font-bold text-slate-800">{items.length}</span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-slate-100 text-sm">
                    <span className="font-semibold text-slate-700">Total unités demandées</span>
                    <span id="order-recap-count" className="font-bold text-slate-900">
                      {totalCount} unité{totalCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 text-slate-600">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Clock className="w-3.5 h-3.5 text-amber-600" strokeWidth={2} />
                      <span>Statut initial : « À chiffrer »</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      Aucun montant ni paiement requis en ligne. Notre administration chiffre votre commande selon les tarifs grossiste applicables et émet le bordereau officiel.
                    </p>
                  </div>

                  <button
                    id="validerCommandeBtn"
                    type="submit"
                    disabled={loading || items.length === 0}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-xs sm:text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                        <span>Envoi en cours…</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" strokeWidth={2} />
                        <span>Envoyer la commande</span>
                      </>
                    )}
                  </button>

                  <Link
                    to="/catalogue"
                    className="block text-center text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
                  >
                    Poursuivre la sélection
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
};
