import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
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

/**
 * Extrait les paramètres de session ou d'erreur présents dans l'URL
 * (compatible hash fragment Supabase #access_token=... et query parameters ?code=...)
 */
function getUrlAuthParams(): Record<string, string> {
  const result: Record<string, string> = {};

  if (typeof window !== 'undefined') {
    if (window.location.search) {
      new URLSearchParams(window.location.search).forEach((v, k) => {
        result[k] = v;
      });
    }
    if (window.location.hash) {
      const hashStr = window.location.hash.startsWith('#')
        ? window.location.hash.substring(1)
        : window.location.hash;
      new URLSearchParams(hashStr).forEach((v, k) => {
        result[k] = v;
      });
    }
  }

  return result;
}

export const Connexion: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState(() => searchParams.get('email') || 'achats@polyclinique-hibiscus.ci');
  const [password, setPassword] = useState(() => (searchParams.get('email') ? '' : 'password123'));
  const [remember, setRemember] = useState(true);

  // États Connexion
  const [error, setError] = useState<string | null>(null);
  const [isEmailNotConfirmed, setIsEmailNotConfirmed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // États Renvoi d'e-mail de confirmation
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // États retour d'URL Supabase
  const [isConfirming, setIsConfirming] = useState(false);
  const [urlConfirmationError, setUrlConfirmationError] = useState<string | null>(null);
  const [confirmationSuccess, setConfirmationSuccess] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const { login, resendConfirmationEmail } = useAuth();
  const navigate = useNavigate();

  // 1. Initialisation : vérifier cooldown et paramètres d'URL (confirmation / erreurs Supabase)
  useEffect(() => {
    // Restaurer le délai anti-clics répétés existant
    const storedCooldown = sessionStorage.getItem('cym_resend_cooldown');
    if (storedCooldown) {
      const remainingMs = parseInt(storedCooldown, 10) - Date.now();
      if (remainingMs > 0) {
        setCooldown(Math.ceil(remainingMs / 1000));
      } else {
        sessionStorage.removeItem('cym_resend_cooldown');
      }
    }

    // Détection des tokens ou erreurs de confirmation Supabase dans l'URL
    const params = getUrlAuthParams();

    if (params.error || params.error_code || params.error_description) {
      const isExpired =
        params.error_code === 'otp_expired' ||
        params.error_description?.toLowerCase().includes('expired') ||
        params.error_description?.toLowerCase().includes('invalid');

      setUrlConfirmationError(
        isExpired
          ? 'Le lien de confirmation est invalide ou a expiré. Vous pouvez demander un nouveau lien ci-dessous.'
          : 'Une erreur est survenue lors de la validation de votre adresse e-mail. Veuillez demander un nouveau lien de confirmation.'
      );
      setIsEmailNotConfirmed(true);

      // Nettoyer le fragment d'URL pour éviter la répétition de l'erreur au rafraîchissement
      if (window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } else if (params.access_token && params.type === 'signup') {
      setIsConfirming(true);
    } else if (searchParams.get('confirmed') === 'true') {
      setConfirmationSuccess(true);
    }
  }, [searchParams]);

  // 2. Décrémentation du cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          sessionStorage.removeItem('cym_resend_cooldown');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // 3. Soumission du formulaire de connexion
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsEmailNotConfirmed(false);
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
        if (res.code === 'EMAIL_NOT_CONFIRMED') {
          setIsEmailNotConfirmed(true);
          setError(
            res.message ||
              "Votre adresse e-mail n'a pas encore été confirmée. Veuillez vérifier votre boîte de réception ou demander un nouveau lien de confirmation ci-dessous."
          );
        } else {
          setError(res.message || 'Email ou mot de passe incorrect.');
        }
      }
    } catch {
      setError('Erreur inattendue. Veuillez vérifier votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Action de renvoi du lien de confirmation
  const handleResendConfirmation = async () => {
    setResendError(null);
    setResendSuccess(false);

    const emailToUse = identifier.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailToUse || !emailRegex.test(emailToUse)) {
      setResendError('Veuillez saisir une adresse e-mail valide dans le champ de connexion ci-dessus.');
      emailInputRef.current?.focus();
      return;
    }

    if (cooldown > 0 || resendLoading) return;

    setResendLoading(true);

    try {
      const res = await resendConfirmationEmail(emailToUse);

      if (res.success) {
        setResendSuccess(true);
        setCooldown(60);
        sessionStorage.setItem('cym_resend_cooldown', String(Date.now() + 60000));
      } else {
        setResendError(res.message);
        if (res.message?.toLowerCase().includes('patienter') || res.message?.toLowerCase().includes('trop de')) {
          setCooldown(60);
          sessionStorage.setItem('cym_resend_cooldown', String(Date.now() + 60000));
        }
      }
    } catch {
      setResendError('Erreur de communication avec le serveur. Veuillez vérifier votre connexion.');
    } finally {
      setResendLoading(false);
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

            {/* Validation en cours du lien de confirmation */}
            {isConfirming && (
              <div
                id="confirmation-processing"
                className="mt-5 rounded-xl p-3.5 text-xs font-semibold text-center flex items-center justify-center gap-2 bg-blue-50 text-blue-800 border border-blue-200"
              >
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                <span>Confirmation de votre e-mail en cours… Redirection vers votre espace…</span>
              </div>
            )}

            {/* Alerte e-mail confirmé avec succès */}
            {confirmationSuccess && (
              <div
                id="confirmation-success"
                className="mt-5 rounded-xl p-3.5 text-xs font-semibold text-center flex items-center justify-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={2} />
                <span>Votre adresse e-mail a été confirmée avec succès. Vous pouvez maintenant vous connecter.</span>
              </div>
            )}

            {/* Alerte erreur liée au lien de confirmation de l'URL */}
            {urlConfirmationError && (
              <div
                id="url-confirmation-error"
                className="mt-5 rounded-xl p-3.5 text-xs font-semibold text-center flex flex-col items-center justify-center gap-2 bg-amber-50 text-amber-900 border border-amber-200"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{urlConfirmationError}</span>
                </div>
              </div>
            )}

            {/* Alerte erreur formulaire de connexion */}
            {error && (
              <div
                id="login-error"
                className={`mt-5 rounded-xl p-3.5 text-xs font-semibold text-center flex flex-col items-center justify-center gap-2 ${
                  isEmailNotConfirmed
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-red-50 text-red-600 border border-red-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertCircle
                    className={`w-3.5 h-3.5 shrink-0 ${isEmailNotConfirmed ? 'text-amber-600' : 'text-red-600'}`}
                    strokeWidth={2}
                  />
                  <span id="login-error-text">{error}</span>
                </div>
                {isEmailNotConfirmed && (
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resendLoading || cooldown > 0}
                    className="mt-1 text-xs font-bold underline hover:no-underline text-amber-950 cursor-pointer disabled:opacity-60"
                  >
                    {resendLoading
                      ? 'Envoi en cours…'
                      : cooldown > 0
                      ? `Patientez ${cooldown}s`
                      : 'Renvoyer le lien de confirmation maintenant'}
                  </button>
                )}
              </div>
            )}

            {/* Alerte succès de connexion */}
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
                  Email professionnel
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-slate-400 pointer-events-none z-10 flex items-center">
                    <Mail className="w-4 h-4" strokeWidth={1.75} />
                  </span>
                  <input
                    ref={emailInputRef}
                    className="input-field !pl-11"
                    style={{ paddingLeft: '2.75rem' }}
                    id="identifier"
                    name="email"
                    placeholder="ex: pharmacie@officine.ci"
                    type="email"
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

            {/* Notification de succès du renvoi d'e-mail */}
            {resendSuccess && (
              <div
                id="resend-success-banner"
                className="mt-4 rounded-xl p-3.5 text-xs font-medium text-left flex items-start gap-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 animate-fadeIn"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} />
                <span className="leading-relaxed">
                  Une nouvelle demande de confirmation a été prise en compte. Vérifiez votre boîte de réception ainsi que vos courriers indésirables.
                </span>
              </div>
            )}

            {/* Notification d'erreur du renvoi d'e-mail */}
            {resendError && (
              <div
                id="resend-error-banner"
                className="mt-4 rounded-xl p-3.5 text-xs font-medium text-left flex items-start gap-2.5 bg-red-50 text-red-700 border border-red-200 animate-fadeIn"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" strokeWidth={2} />
                <span className="leading-relaxed">{resendError}</span>
              </div>
            )}

            {/* Action discrète de renvoi du lien de confirmation */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col items-center text-center gap-1.5">
              <p className="text-xs text-slate-500">
                Vous n'avez pas reçu votre e-mail de confirmation ?
              </p>
              <button
                type="button"
                id="resend-confirmation-btn"
                onClick={handleResendConfirmation}
                disabled={resendLoading || cooldown > 0}
                className="text-xs font-bold transition hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5 text-[var(--primary)]"
              >
                {resendLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Envoi en cours…</span>
                  </>
                ) : cooldown > 0 ? (
                  <span>Renvoyer dans {cooldown}s</span>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>Renvoyer le lien de confirmation</span>
                  </>
                )}
              </button>
            </div>

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
