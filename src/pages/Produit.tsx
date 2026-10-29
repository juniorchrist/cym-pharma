import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  ShieldCheck,
  ShoppingCart,
  Minus,
  Plus,
  Truck,
  FileText,
  LogIn,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { ProductImageFallback } from '../components/product/ProductImageFallback';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { storage } from '../utils/storage';
import { getProductById, ALL_PRODUCTS } from '../data/catalog';
import { Product } from '../types';

export const Produit: React.FC = () => {
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get('id') || searchParams.get('p') || 'prod-001';
  const { add, openDrawer } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setLoading(true);
    const found = getProductById(idParam) || ALL_PRODUCTS[0];
    setProduct(found || null);
    setLoading(false);
  }, [idParam]);

  const handleAddToCart = () => {
    if (!product) return;
    if (!isAuthenticated) {
      storage.setRedirectAfterLogin(window.location.pathname + window.location.search);
      navigate('/connexion');
      return;
    }
    add(
      product.id,
      product.name,
      qty,
      product.reference || product.sku,
      product.conditionnement || product.unit,
      product.unit
    );
    openDrawer();
  };

  if (loading) {
    return (
      <PageShell>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 pb-16">
          <LoadingState message="Chargement de la fiche produit…" />
        </div>
      </PageShell>
    );
  }

  if (!product) {
    return (
      <PageShell>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-28 pb-16">
          <ErrorState
            title="Produit introuvable"
            message="Cette référence médicale n'est pas répertoriée ou est momentanément indisponible."
            onRetry={() => window.location.reload()}
          />
        </div>
      </PageShell>
    );
  }

  const refCode = product.reference || product.sku || `REF-${product.id}`;

  return (
    <PageShell>
      <div className="relative w-full px-4 sm:px-6 pt-28 pb-16">
        <div className="mx-auto w-full max-w-6xl">
          {/* FIL D'ARIANE */}
          <nav className="flex items-center gap-2 text-xs mb-6 text-slate-500" aria-label="Fil d'Ariane">
            <Link to="/accueil" className="hover:text-slate-900 transition">
              Accueil
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <Link to="/catalogue" className="hover:text-slate-900 transition">
              Catalogue
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span id="product-breadcrumb" className="font-semibold text-slate-800 truncate max-w-sm">
              {product.name}
            </span>
          </nav>

          <div className="grid gap-10 lg:grid-cols-2 items-start">
            {/* COLONNE GAUCHE : ICONE & SPÉCIFICATIONS (Pas de photo d'article) */}
            <div className="space-y-6">
              <div className="product-img-box p-8 relative flex items-center justify-center min-h-[280px] bg-slate-50 rounded-2xl border border-slate-100">
                <ProductImageFallback
                  category={product.category || product.category_main}
                  name={product.name}
                  size={56}
                />
              </div>

              {/* Spécifications techniques (sans En stock, sans CE ISO) */}
              <div className="card p-6 space-y-3">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[var(--primary)]" strokeWidth={2} />
                  <span>Caractéristiques de l'article</span>
                </h3>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Référence</span>
                    <span id="spec-ref" className="font-semibold text-slate-800 font-mono">
                      {refCode}
                    </span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Catégorie</span>
                    <span id="spec-category" className="font-semibold text-slate-800">
                      {product.category || product.category_main || 'Consommables médicaux'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Conditionnement</span>
                    <span id="spec-packaging" className="font-semibold text-slate-800">
                      {product.conditionnement || product.unit || 'Conditionnement standard'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Destination</span>
                    <span className="font-semibold text-slate-800">
                      Hôpitaux, cliniques, pharmacies &amp; cabinets
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* COLONNE DROITE : INFOS & AJOUT PANIER */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest font-mono" id="product-ref">
                    RÉF. {refCode}
                  </span>
                  {product.conditionnement && (
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md">
                      {product.conditionnement}
                    </span>
                  )}
                </div>
                <h1 id="product-name" className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight">
                  {product.name}
                </h1>
                <p id="product-desc" className="mt-3 text-sm text-slate-600 leading-relaxed">
                  {product.description ||
                    product.description_short ||
                    'Dispositif médical et consommable hospitalier distribué en Côte d’Ivoire par CYM Pharma.'}
                </p>
              </div>

              {/* Sélecteur quantité et action panier */}
              <div className="card p-5 space-y-4">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex items-center justify-between sm:justify-start gap-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Quantité :
                    </span>
                    <div className="qty-wrap">
                      <button
                        type="button"
                        onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                        aria-label="Diminuer la quantité"
                        className="qty-btn"
                      >
                        <Minus className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                      <span className="qty-display">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty((prev) => prev + 1)}
                        aria-label="Augmenter la quantité"
                        className="qty-btn"
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  <button
                    id="add-to-cart-btn"
                    type="button"
                    onClick={handleAddToCart}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"
                  >
                    {isAuthenticated ? (
                      <>
                        <ShoppingCart className="w-4 h-4" strokeWidth={2} />
                        <span>Ajouter au bon de commande</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" strokeWidth={2} />
                        <span>Se connecter pour commander</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Réassurance B2B */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Truck className="w-4 h-4 text-[var(--primary)]" strokeWidth={1.8} />
                    <span>Livraison Abidjan</span>
                  </div>
                  <p className="text-slate-500 leading-snug">
                    Acheminement direct dans toutes les communes.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <FileText className="w-4 h-4 text-[var(--primary)]" strokeWidth={1.8} />
                    <span>Facture &amp; Proforma</span>
                  </div>
                  <p className="text-slate-500 leading-snug">
                    Bon de livraison et facture émise pour votre économat.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};
