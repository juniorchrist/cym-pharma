import React, { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { Search, ShoppingCart, ChevronRight, ArrowLeft } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { ProductCard } from '../components/product/ProductCard';
import { ProductImageFallback } from '../components/product/ProductImageFallback';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { useReveal } from '../hooks/useReveal';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { getProductsForCategory, getCategoryBySlug, ALL_PRODUCTS } from '../data/catalog';
import { Product } from '../types';

export const Categorie: React.FC = () => {
  useReveal();
  const [searchParams] = useSearchParams();
  const { slug } = useParams<{ slug?: string }>();
  const { add } = useCart();
  const { showToast } = useToast();

  const rawParam = slug || searchParams.get('categorie') || searchParams.get('name') || 'abaisse-langue';
  const categorySlug = rawParam.toLowerCase().trim();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());

  // Category metadata from catalog
  const categoryInfo = useMemo(() => {
    return getCategoryBySlug(categorySlug);
  }, [categorySlug]);

  const categoryTitle = useMemo(() => {
    if (categoryInfo) return categoryInfo.name;
    return rawParam
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }, [categoryInfo, rawParam]);

  useEffect(() => {
    setLoading(true);

    // Retrieve products matching this category slug or query
    const matched = getProductsForCategory(categorySlug);

    if (matched.length > 0) {
      setProducts(matched);
    } else {
      // Fuzzy search across all products if slug didn't directly match
      const norm = categorySlug.replace(/-/g, ' ');
      const fallbackList = ALL_PRODUCTS.filter(
        (p) =>
          (p.category || '').toLowerCase().includes(norm) ||
          (p.category_main || '').toLowerCase().includes(norm) ||
          p.name.toLowerCase().includes(norm)
      );
      setProducts(fallbackList.length > 0 ? fallbackList : ALL_PRODUCTS.slice(0, 8));
    }

    setLoading(false);
  }, [categorySlug]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.reference || p.sku || '').toLowerCase().includes(term) ||
        (p.conditionnement || '').toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const toggleSelect = (id: string | number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddSelectedToCart = () => {
    if (selectedIds.size === 0) {
      showToast('Veuillez cocher au moins un produit à ajouter.', 'warning');
      return;
    }

    let addedCount = 0;
    products.forEach((p) => {
      if (selectedIds.has(p.id)) {
        add(
          p.id,
          p.name,
          1,
          p.reference || p.sku,
          p.conditionnement || p.unit,
          p.unit
        );
        addedCount++;
      }
    });

    showToast(`${addedCount} article(s) sélectionné(s) ajouté(s) au panier.`, 'success');
    setSelectedIds(new Set());
  };

  return (
    <PageShell>
      <div className="relative w-full px-4 sm:px-6 pt-28 pb-16">
        <div className="mx-auto w-full max-w-6xl">
          {/* BREADCRUMB */}
          <div className="reveal mb-6">
            <nav className="breadcrumb flex items-center gap-2 text-xs text-slate-500" aria-label="Fil d'Ariane">
              <Link to="/accueil" className="hover:text-slate-900 transition">
                Accueil
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <Link to="/catalogue" className="hover:text-slate-900 transition">
                Catalogue
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span id="breadcrumb-name" className="text-slate-700 font-semibold truncate max-w-md">
                {categoryTitle}
              </span>
            </nav>
          </div>

          {/* BANNIÈRE CATÉGORIE */}
          <div id="category-banner" className="reveal mb-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center p-3 shrink-0"
                  style={{
                    background: categoryInfo?.bg || '#EFF6FF',
                    border: `1px solid ${categoryInfo?.border || '#BFDBFE'}`,
                  }}
                >
                  <ProductImageFallback category={categoryTitle} size={32} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full text-[var(--primary)] bg-[var(--primary-tint)] border border-blue-200">
                      {categoryInfo?.badge || 'Gamme Médicale & Hospitalière'}
                    </span>
                    <Link
                      to="/catalogue"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[var(--primary)] transition ml-auto"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      <span>Toutes les catégories</span>
                    </Link>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    {categoryTitle}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
                    {categoryInfo?.description ||
                      "Matériels médicaux et consommables d'intervention pour officines, cabinets et cliniques privées en Côte d'Ivoire."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* BARRE D'OUTILS : Recherche + Compteur + Commande groupée */}
          <div className="reveal mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                <span id="product-count" className="font-bold text-slate-900">
                  {filteredProducts.length}
                </span>{' '}
                article(s) disponible(s)
              </span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              {/* Recherche */}
              <div className="relative flex-1 sm:w-64">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400 pointer-events-none w-4 h-4"
                  strokeWidth={2}
                />
                <input
                  id="search-input"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrer dans cette catégorie…"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition shadow-xs"
                />
              </div>

              {/* Commande groupée */}
              <button
                type="button"
                id="add-selected-btn"
                onClick={handleAddSelectedToCart}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-[var(--primary)] hover:text-[var(--primary)] transition shrink-0 cursor-pointer shadow-xs"
                title="Ajouter la sélection au panier"
              >
                <ShoppingCart className="w-3.5 h-3.5" strokeWidth={2} />
                <span>
                  <span className="hidden sm:inline">Sélection</span> ({selectedIds.size}) → Panier
                </span>
              </button>
            </div>
          </div>

          {/* GRILLE DES PRODUITS */}
          <div className="reveal" id="products-grid">
            {loading ? (
              <LoadingState message="Chargement des références médicales…" />
            ) : filteredProducts.length === 0 ? (
              <EmptyState
                title="Aucun produit dans cette catégorie"
                description="Aucun article médical ne correspond à vos termes de recherche dans cette famille."
                actionLabel="Consulter tout le catalogue"
                onAction={() => (window.location.href = '/catalogue')}
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    showCheckbox={true}
                    isSelected={selectedIds.has(p.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
};
