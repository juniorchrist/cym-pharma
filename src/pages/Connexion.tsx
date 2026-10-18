import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UserCheck,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { PasswordInput } from '../components/ui/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { storage } from '../utils/storage';

export const Connexion: React.FC = () => {
  const [identifier, setIdentifier] = useState('achats@polyclinique-hibiscus.ci');
  const [password, setPassword] = useState('password123');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!identifier.trim() || !password) {
      setError('Veuillez saisir votre identifiant et votre mot de passe.');
      return;
    }

    setLoading(true);

    try {
      const res = await login(identifier.trim(), password);

      if (res.success) {
        setSuccess(true);
        const redirect = storage.getRedirectAfterLogin() || '/dashboard';
        storage.clearRedirectAfterLogin();
        setTimeout(() => {
          navigate(redirect);
        }, 600);
      } else {
        setError(res.message || 'Email ou mot de passe incorrect.');
      }
    } catch {
      setError('Erreur inattendue. Veuillez vérifier votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <div className="pt-28 pb-20 flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-[440px] flex flex-col items-center">
          {/* Carte d'Authentification */}
          <div className="w-full auth-card p-8 sm:p-9 flex flex-col">
            {/* Logo & Titre */}
            <div className="flex flex-col items-center text-center">
              <Link to="/accueil" className="mb-4">
                <img src="/LOGO.png" alt="CYM Pharma" className="h-14 w-auto object-contain" />
              </Link>
              <h1 className="text-2xl font-bold tracking-tight mb-2 text-slate-900">
                Content de vous revoir
              </h1>
              <p className="text-xs leading-relaxed max-w-xs text-slate-500">
                Accédez à votre espace santé et approvisionnement médical sécurisé.
              </p>
            </div>

            {/* Alertes contextuelles */}
            {error && (
              <div
                id="login-error"
                className="mt-5 rounded-xl p-3.5 text-xs font-semibold text-center flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                <span id="login-error-text">{error}</span>
              </div>
            )}

            {success && (
              <div
                id="login-success"
                className="mt-5 rounded-xl p-3.5 text-xs font-semibold text-center flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" strokeWidth={2} />
                <span>Connexion réussie — redirection…</span>
              </div>
            )}

            {/* Formulaire */}
            <form id="login-form" onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              {/* Champ Identifiant / Email */}
              <div className="flex flex-col gap-1.5 text-left">
                <label className="text-xs font-semibold text-slate-800" htmlFor="identifier">
                  Email ou téléphone professionnel
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-slate-400 pointer-events-none">
                    <Mail className="w-[15px] h-[15px]" strokeWidth={1.75} />
                  </span>
                  <input
                    className="input-field"
                    id="identifier"
                    name="email"
                    placeholder="ex: pharmacie@officine.ci"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Champ Mot de passe */}
              <div className="flex flex-col gap-1.5 text-left">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800" htmlFor="password">
                    Mot de passe
                  </label>
                  <Link
                    to="/contact"
                    className="text-xs font-medium hover:underline transition text-[var(--primary)]"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="••••••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {/* Se souvenir de moi */}
              <div className="flex items-center justify-between mt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="remember"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-[#155E95]"
                  />
                  <span className="text-xs text-slate-500">Se souvenir de moi</span>
                </label>
              </div>

              {/* Bouton Submit */}
              <button
                id="login-submit-btn"
                disabled={loading}
                className="w-full h-12 mt-2 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition hover:brightness-110 shadow-sm disabled:opacity-60 cursor-pointer"
                style={{ background: 'var(--primary)' }}
                type="submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connexion…</span>
                  </>
                ) : (
                  <>
                    <span>Se connecter</span>
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                  </>
                )}
              </button>
            </form>

            {/* Séparateur */}
            <div className="relative flex items-center justify-center my-6">
              <div className="w-full h-[1px] bg-slate-200"></div>
              <span className="absolute px-3 bg-white text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                ou
              </span>
            </div>

            {/* Bouton Pro Santé */}
            <Link
              to="/contact"
              className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition hover:bg-slate-50 border border-slate-200 bg-slate-100 text-slate-800"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />
              <span>Demander un accès professionnel direct</span>
            </Link>

            {/* Pied de carte */}
            <div className="mt-6 pt-5 flex items-center justify-center gap-1.5 text-xs border-t border-slate-200/70 text-slate-500">
              <span>Pas encore de compte ?</span>
              <Link
                className="font-bold hover:underline transition text-[var(--primary)]"
                to="/inscription"
              >
                Créer un compte professionnel
              </Link>
            </div>
          </div>

          {/* Réassurance réglementaire */}
          <div className="mt-7 flex flex-col items-center gap-2 text-center text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2} />
              <span>Plateforme sécurisée SSL 256-bit • Données de santé protégées</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span>Agrément pharmaceutique</span>
              <span>•</span>
              <span>Support officines &amp; cliniques</span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};
