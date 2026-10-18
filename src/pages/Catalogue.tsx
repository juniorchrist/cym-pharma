import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  Activity,
  Syringe,
  Wind,
  FlaskConical,
  FlaskRound,
  Sparkles,
  Layers,
  Bed,
  BedDouble,
  Accessibility,
  Truck,
  Shield,
  Scissors,
  Package,
  HeartPulse,
  Pipette,
  Eye,
  Box,
  Scale,
  Receipt,
  ShoppingBag,
  Thermometer,
  Cross,
  Stethoscope,
  Smile,
  Droplet,
  Droplets,
  Bandage,
  Hand,
  CircleDot,
  Lightbulb,
  Gauge,
  Ear,
  Scan,
  Footprints,
  Trash2,
  Cable,
  TestTube,
  TestTubes,
  Ruler,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { useReveal } from '../hooks/useReveal';
import { CATALOG_CATEGORIES, ALL_PRODUCTS } from '../data/catalog';

// Map of icon names to lucide components
const CATEGORY_ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>> = {
  Activity,
  Syringe,
  Wind,
  FlaskConical,
  FlaskRound,
  Sparkles,
  Layers,
  Bed,
  BedDouble,
  Accessibility,
  Truck,
  Shield,
  Scissors,
  Package,
  HeartPulse,
  Pipette,
  Eye,
  Box,
  Scale,
  Receipt,
  ShoppingBag,
  Thermometer,
  Cross,
  Stethoscope,
  Smile,
  Droplet,
  Droplets,
  Bandage,
  Hand,
  CircleDot,
  Lightbulb,
  Gauge,
  Ear,
  Scan,
  Footprints,
  Trash2,
  Cable,
  TestTube,
  TestTubes,
  Ruler,
};

export const Catalogue: React.FC = () => {
  useReveal();
  const [searchTerm, setSearchTerm] = useState('');

  // Map category slug to count of products
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ALL_PRODUCTS.forEach((p) => {
      const catSlug = (p.category_main || '').toLowerCase();
      counts[catSlug] = (counts[catSlug] || 0) + 1;
    });
    return counts;
  }, []);

  const filteredCategories = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return CATALOG_CATEGORIES;
    return CATALOG_CATEGORIES.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.badge.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term) ||
        c.slug.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const renderCategoryIcon = (iconName: string, color: string) => {
    const IconComp = CATEGORY_ICON_COMPONENTS[iconName] || Package;
    return <IconComp className="w-6 h-6" strokeWidth={1.8} style={{ color }} />;
  };

  return (
    <PageShell>
      <div className="relative w-full px-4 sm:px-6 pt-28 pb-16">
        <div className="mx-auto w-full max-w-6xl">
          {/* EN-TÊTE CATALOGUE */}
          <div className="reveal mb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--primary)] mb-2">
                  CYM Pharma
                </p>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                  Catalogue
                </h1>
                <p className="text-slate-500 text-sm sm:text-base mt-1.5 max-w-2xl leading-relaxed">
                  Parcourez nos{' '}
                  <span id="total-categories" className="font-semibold text-slate-700">
                    {CATALOG_CATEGORIES.length}
                  </span>{' '}
                  catégories et{' '}
                  <span className="font-semibold text-slate-700">
                    {ALL_PRODUCTS.length}
                  </span>{' '}
                  articles médicaux répertoriés.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative w-full sm:w-72">
                  <Search
                    className="absolute left-3 top-2.5 text-slate-400 pointer-events-none w-4 h-4"
                    strokeWidth={2}
                  />
                  <input
                    id="search-input"
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Rechercher une catégorie ou un article…"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition shadow-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* GRILLE DES CATÉGORIES */}
          <div className="reveal grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" id="categories-grid">
            {filteredCategories.map((cat) => {
              const count = categoryCounts[cat.slug] || 0;
              return (
                <Link
                  key={cat.slug}
                  to={`/categorie?categorie=${cat.slug}`}
                  className="cat-card group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-[var(--primary)] hover:shadow-md transition-all duration-200"
                  data-category-slug={cat.slug}
                  data-category-name={cat.name}
                >
                  <div>
                    {/* En-tête de carte : Icône */}
                    <div className="mb-4">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center p-2.5 shrink-0 transition-transform duration-200 group-hover:scale-105"
                        style={{ background: cat.bg, border: `1px solid ${cat.border}` }}
                      >
                        {renderCategoryIcon(cat.iconName, cat.color)}
                      </div>
                    </div>

                    {/* Titre de la catégorie */}
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-[var(--primary)] transition-colors duration-150 leading-snug">
                      {cat.name}
                    </h3>
                  </div>

                  {/* Pied de carte : Compteur d'articles & Action */}
                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.color }}></span>
                      {count} {count > 1 ? 'articles' : 'article'}
                    </span>
                    <span className="font-bold text-[var(--primary)] inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Voir plus</span>
                      <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {filteredCategories.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <p className="text-sm font-semibold text-slate-700">Aucune catégorie trouvée pour « {searchTerm} »</p>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-3 text-xs font-bold text-[var(--primary)] hover:underline"
              >
                Réinitialiser la recherche
              </button>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
};
