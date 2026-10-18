import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Truck,
  Headphones,
  Syringe,
  Activity,
  Shield,
  HeartPulse,
  Clock,
  Package,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { useReveal } from '../hooks/useReveal';
import { Products } from '../services/api';

export const Accueil: React.FC = () => {
  useReveal();
  const [productCount, setProductCount] = useState<string>('500+');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const r = await Products.list({ limit: 1 });
        if (isMounted && r.success && r.data?.pagination?.total) {
          const total = r.data.pagination.total;
          setProductCount(total > 0 ? `${total}+` : '500+');
        }
      } catch {
        // Keep default fallback
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PageShell>
      <div className="relative w-full px-4 sm:px-6 pt-28 pb-8">
        <div className="mx-auto w-full max-w-6xl">
          {/* HERO */}
          <section className="reveal grid lg:grid-cols-2 gap-10 items-center py-8 lg:py-14">
            <div className="space-y-6 text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] text-slate-900">
                Des solutions fiables <br className="hidden sm:block" /> et accessibles pour vos besoins.
              </h1>
              <p className="text-base sm:text-lg text-slate-500 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                materiels &amp; consommables medicaux &amp; livrés partout en Côte d'Ivoire.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-2">
                <Link
                  to="/catalogue"
                  className="btn-primary w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  <span>Découvrir le catalogue</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </Link>
                <Link
                  to="/contact"
                  className="btn-secondary w-full sm:w-auto flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" strokeWidth={2} />
                  <span>Demander un devis pro</span>
                </Link>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden card h-64 sm:h-80 lg:h-[26rem]">
              <img
                src="/assets/images/Kit médical bleu et blanc.png"
                alt="Équipements médicaux CYM Pharma"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/LOGO.png';
                }}
              />
              <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-sm px-3 py-1.5 shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" strokeWidth={2} />
                <span className="text-xs font-semibold text-slate-800">Traçabilité hospitalière 100%</span>
              </div>
            </div>
          </section>

          {/* STATS */}
          <section className="reveal flex justify-center py-4">
            <div className="stats-bar flex items-center gap-6 sm:gap-8 bg-white rounded-2xl px-6 sm:px-8 py-4 shadow-sm border border-slate-100 flex-wrap sm:flex-nowrap justify-center">
              <div className="flex items-center gap-2.5">
                <span id="stat-produits" className="text-xl font-extrabold text-slate-900">
                  {productCount}
                </span>
                <span className="text-xs text-slate-500 font-medium leading-tight">
                  Références
                  <br />
                  médicales
                </span>
              </div>
              <div className="stat-sep hidden sm:block w-px h-9 bg-slate-200"></div>
              <div className="flex items-center gap-2.5">
                <span className="text-xl font-extrabold text-slate-900">24h</span>
                <span className="text-xs text-slate-500 font-medium leading-tight">
                  Livraison
                  <br />
                  express
                </span>
              </div>
              <div className="stat-sep hidden sm:block w-px h-9 bg-slate-200"></div>
              <div className="flex items-center gap-2.5">
                <span id="stat-clients" className="text-xl font-extrabold text-slate-900">
                  2 400+
                </span>
                <span className="text-xs text-slate-500 font-medium leading-tight">
                  Professionnels
                  <br />
                  de santé
                </span>
              </div>
            </div>
          </section>

          {/* ENGAGEMENTS */}
          <section className="reveal py-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Engagements CYM Pharma</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="card p-5 flex items-start gap-3.5">
                <div
                  className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--success-tint)', color: 'var(--success)' }}
                >
                  <ShieldCheck className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Produits certifiés</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Normes hospitalières strictes et traçabilité de lot par lot.
                  </p>
                </div>
              </div>
              <div className="card p-5 flex items-start gap-3.5">
                <div
                  className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--primary-tint)', color: 'var(--primary)' }}
                >
                  <Truck className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Livraison express</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Expédition en 24/48h avec maintien de la chaîne du froid.
                  </p>
                </div>
              </div>
              <div className="card p-5 flex items-start gap-3.5">
                <div
                  className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--warning-tint)', color: 'var(--warning)' }}
                >
                  <Headphones className="w-4 h-4" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Support médical</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    une écoute à votre service 6j/7.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CATÉGORIES */}
          <section className="reveal py-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">Catégories médicales</h2>
              <Link
                to="/catalogue"
                className="text-sm font-semibold text-[var(--primary)] flex items-center gap-1 hover:gap-2 transition-all"
              >
                <span>Tout voir</span>
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
              <Link to="/categorie?categorie=pansement" className="category-card">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--surface-alt)', color: 'var(--primary)' }}
                  >
                    <Syringe className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <span className="badge badge-primary">140+</span>
                </div>
                <span className="text-sm font-bold text-slate-900 block">Consommables</span>
                <span className="text-xs text-slate-500 block mt-0.5">Seringues, compresses</span>
              </Link>

              <Link to="/categorie?categorie=diagnostics" className="category-card">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--surface-alt)', color: 'var(--primary)' }}
                  >
                    <Activity className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <span className="badge badge-primary">85+</span>
                </div>
                <span className="text-sm font-bold text-slate-900 block">Diagnostic</span>
                <span className="text-xs text-slate-500 block mt-0.5">Tensiomètres, oxymètres</span>
              </Link>

              <Link to="/categorie?categorie=protection" className="category-card">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--surface-alt)', color: 'var(--primary)' }}
                  >
                    <Shield className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <span className="badge badge-primary">62+</span>
                </div>
                <span className="text-sm font-bold text-slate-900 block">Protection</span>
                <span className="text-xs text-slate-500 block mt-0.5">Gants, masques, blouses</span>
              </Link>

              <Link to="/categorie?categorie=sterilisation" className="category-card">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--surface-alt)', color: 'var(--primary)' }}
                  >
                    <HeartPulse className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <span className="badge badge-primary">34+</span>
                </div>
                <span className="text-sm font-bold text-slate-900 block">Équipements</span>
                <span className="text-xs text-slate-500 block mt-0.5">Moniteurs, stérilisateurs</span>
              </Link>

              <Link to="/categorie?categorie=secours" className="category-card">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--warning-tint)', color: 'var(--warning)' }}
                  >
                    <Clock className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <span className="badge badge-warning">24/7</span>
                </div>
                <span className="text-sm font-bold text-slate-900 block">Urgence</span>
                <span className="text-xs text-slate-500 block mt-0.5">Trousses, brancards</span>
              </Link>
            </div>
          </section>

          {/* POURQUOI CYM PHARMA */}
          <section className="reveal py-8">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link to="/catalogue" className="card p-5 flex flex-col group">
                <div
                  className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--primary-tint)', color: 'var(--primary)' }}
                >
                  <Package className="w-4 h-4" strokeWidth={2} />
                </div>
                <span className="badge badge-primary self-start mb-2">Catalogue</span>
                <h3 className="text-sm font-bold text-slate-900">Consommables certifiés</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Parcourez nos 500+ produits CE/ISO 13485 avec filtres par catégorie.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)] group-hover:gap-2 transition-all">
                  <span>Voir le catalogue</span>
                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                </span>
              </Link>

              <div className="card p-5 flex flex-col">
                <div
                  className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--success-tint)', color: 'var(--success)' }}
                >
                  <FileText className="w-4 h-4" strokeWidth={2} />
                </div>
                <span className="badge badge-success self-start mb-2">B2B</span>
                <h3 className="text-sm font-bold text-slate-900">Tarifs dégressifs</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Accédez aux grilles tarifaires professionnelles sur inscription validée.
                </p>
                <span className="mt-4 inline-block text-xs font-semibold text-slate-400">
                  Disponible après inscription
                </span>
              </div>

              <Link to="/contact" className="card p-5 flex flex-col group sm:col-span-2 lg:col-span-1">
                <div
                  className="icon-chip w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--surface-alt)', color: 'var(--text)' }}
                >
                  <Headphones className="w-4 h-4" strokeWidth={2} />
                </div>
                <span className="badge self-start mb-2" style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}>
                  Support
                </span>
                <h3 className="text-sm font-bold text-slate-900 mt-1">Support B2B dédié</h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Devis personnalisés, suivi de commande et livraison prioritaire sous 2h.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 group-hover:text-slate-900 group-hover:gap-2 transition-all">
                  <span>Nous contacter</span>
                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                </span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
};
