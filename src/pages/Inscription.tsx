import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { PasswordInput } from '../components/ui/PasswordInput';
import { useAuth } from '../context/AuthContext';

export const VILLES_INSCRIPTION = [
  'Anoumaba',
  'Abobo',
  'Aboisso',
  'Adiaké',
  'Adjamé',
  'Akakro/Ehania',
  'Anyama',
  'Bassam',
  'Bonoua',
  'Bingerville',
  'Cechi',
  'Cocody',
  'Ehania',
  'Koumassi',
  'Marcory',
  'Marcory zone-3',
  'Maféré',
  "M'batto",
  'Port Bouet',
  'Plateau',
  'Treichville',
  'Yopougon',
] as const;

export const Inscription: React.FC = () => {
  const [step, setStep] = useState<1 | 2>(1);
  const [client, setClient] = useState('');
  const [responsable, setResponsable] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [commune, setCommune] = useState('Cocody');
  const [customCommune, setCustomCommune] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [terms, setTerms] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Password strength logic
  const getPasswordStrength = () => {
    if (!password) return { label: 'À définir', color: 'text-slate-400', level: 0 };
    if (password.length < 6) return { label: 'Trop court', color: 'text-red-500', level: 1 };
    if (password.length < 8 || !/[0-9]/.test(password))
      return { label: 'Moyen', color: 'text-amber-500', level: 2 };
    return { label: 'Robuste', color: 'text-emerald-600', level: 3 };
  };

  const strength = getPasswordStrength();

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!client.trim() || !responsable.trim() || !phone.trim() || !email.trim()) {
      setError('Veuillez remplir tous les champs obligatoires (*).');
      return;
    }
    if (!emailOk) {
      setError('Veuillez saisir une adresse email valide.');
      return;
    }
    if (commune === 'Autre' && !customCommune.trim()) {
      setError('Veuillez préciser le nom de votre ville ou localité.');
      return;
    }

    setStep(2);
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!terms) {
      setError('Veuillez accepter les conditions de vente pour continuer.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe saisis ne sont pas identiques.');
      return;
    }

    setLoading(true);

    try {
      const finalCommune = commune === 'Autre' ? customCommune.trim() : commune;
      const payload = {
        name: responsable.trim(),
        client: client.trim(),
        responsable: responsable.trim(),
        email: email.trim(),
        phone: phone.trim(),
        commune: finalCommune,
        password,
        establishmentName: client.trim(),
      };

      const res = await register(payload);

      if (res.success) {
        setSuccess(true);
        if (res.code === 'CONFIRMATION_REQUIRED') {
          setRequiresConfirmation(true);
        } else {
          const redirectParam = searchParams.get('redirect');
          setTimeout(() => {
            navigate(redirectParam === 'checkout' ? '/commande' : '/dashboard');
          }, 1200);
        }
      } else {
        setError(res.message || 'Erreur lors de la création du compte.');
      }
    } catch {
      setError('Erreur inattendue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell>
      <div className="pt-28 pb-20 flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-[520px] flex flex-col items-center">
          {/* Carte Inscription en 2 étapes */}
          <div className="w-full auth-card p-8 sm:p-10 flex flex-col items-center relative">
            {/* Logo */}
            <Link to="/accueil" className="mb-6">
              <img src="/LOGO.png" alt="CYM Pharma" className="h-14 w-auto object-contain" />
            </Link>

            {/* Indicateur de progression (Step 1 / Step 2) */}
            <div className="w-full mb-8">
              <div className="flex items-center justify-between relative px-6">
                {/* Barre de fond */}
                <div className="absolute left-12 right-12 top-4 -translate-y-1/2 h-[3px] bg-slate-200 -z-0 rounded-full overflow-hidden">
                  <div
                    id="step-line-fill"
                    className="h-full bg-[#155E95] transition-all duration-300 ease-out"
                    style={{ width: step === 2 ? '100%' : '0%' }}
                  />
                </div>
                {/* Node 1 */}
                <div className="flex flex-col items-center relative z-10">
                  <div
                    id="node-badge-1"
                    className="w-8 h-8 rounded-full bg-[#155E95] text-white flex items-center justify-center font-bold text-xs shadow-md transition-all duration-300"
                  >
                    1
                  </div>
                  <span
                    id="node-label-1"
                    className="mt-2 text-xs font-bold tracking-tight text-center text-[var(--primary)]"
                  >
                    1. Structure &amp; Contact
                  </span>
                </div>
                {/* Node 2 */}
                <div className="flex flex-col items-center relative z-10">
                  <div
                    id="node-badge-2"
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 ${
                      step === 2
                        ? 'bg-[#155E95] text-white shadow-md'
                        : 'border-2 border-slate-300 bg-white text-slate-400'
                    }`}
                  >
                    2
                  </div>
                  <span
                    id="node-label-2"
                    className={`mt-2 text-xs tracking-tight text-center ${
                      step === 2
                        ? 'font-bold text-[var(--primary)]'
                        : 'font-medium text-slate-400'
                    }`}
                  >
                    2. Sécurité &amp; Mot de passe
                  </span>
                </div>
              </div>
            </div>

            {/* Alertes d'erreurs */}
            {error && (
              <div
                id="register-error"
                className="w-full mb-5 rounded-xl p-3.5 text-xs font-semibold text-center flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-200"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" strokeWidth={2} />
                <span id="register-error-text">{error}</span>
              </div>
            )}

            {/* ÉTAPE 1 : Infos structure / contact */}
            {step === 1 && !success && (
              <div id="step-panel-1" className="w-full flex flex-col">
                <div className="text-center w-full mb-6">
                  <h1 className="text-2xl font-bold tracking-tight mb-1 text-slate-900">
                    Créer un compte professionnel
                  </h1>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Accédez aux tarifs B2B dégressifs et commandez en ligne.
                  </p>
                </div>

                <form id="form-step-1" onSubmit={handleStep1Submit} className="flex flex-col gap-4">
                  {/* Nom de la structure */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-800" htmlFor="client">
                      Nom de la structure / Officine <span className="text-[var(--primary)]">*</span>
                    </label>
                    <input
                      id="client"
                      className="form-input"
                      placeholder="ex: Pharmacie Sainte-Marie"
                      required
                      type="text"
                      value={client}
                      onChange={(e) => setClient(e.target.value)}
                    />
                  </div>

                  {/* Responsable */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-800" htmlFor="responsable">
                      Nom &amp; Prénom du praticien ou gérant <span className="text-[var(--primary)]">*</span>
                    </label>
                    <input
                      id="responsable"
                      className="form-input"
                      placeholder="ex: Dr. Kouamé Jean"
                      required
                      type="text"
                      value={responsable}
                      onChange={(e) => setResponsable(e.target.value)}
                    />
                  </div>

                  {/* Téléphone */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-800" htmlFor="phone">
                      Téléphone professionnel <span className="text-[var(--primary)]">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="h-11 px-3 rounded-xl flex items-center text-xs font-bold shrink-0 select-none border border-slate-200 bg-slate-100 text-slate-800">
                        <span>CI +225</span>
                      </div>
                      <input
                        id="phone"
                        className="form-input"
                        placeholder="05 94 84 18 18"
                        required
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-semibold flex justify-between items-center text-slate-800" htmlFor="email">
                      <span>
                        Email professionnel <span className="text-[var(--primary)]">*</span>
                      </span>
                      <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                        <Check className="w-3 h-3" strokeWidth={2} />
                        Vérifié
                      </span>
                    </label>
                    <input
                      id="email"
                      className="form-input"
                      placeholder="direction@pharmacie-stemarie.ci"
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  {/* Commune */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-800" htmlFor="commune">
                      Ville / Localité <span className="text-[var(--primary)]">*</span>
                    </label>
                    <select
                      id="commune"
                      value={commune}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCommune(val);
                        if (val !== 'Autre') {
                          setCustomCommune('');
                        }
                      }}
                      className="form-input cursor-pointer"
                    >
                      {VILLES_INSCRIPTION.map((ville) => (
                        <option key={ville} value={ville}>
                          {ville}
                        </option>
                      ))}
                      <option value="Autre">Autre (préciser la ville…)</option>
                    </select>

                    {commune === 'Autre' && (
                      <div className="flex flex-col gap-1.5 mt-2 animate-fadeIn">
                        <label className="text-xs font-semibold text-slate-700" htmlFor="customCommune">
                          Précisez votre ville / localité <span className="text-[var(--primary)]">*</span>
                        </label>
                        <input
                          id="customCommune"
                          className="form-input"
                          placeholder="Ex: Yamoussoukro, Daloa, San-Pédro..."
                          required
                          type="text"
                          value={customCommune}
                          onChange={(e) => setCustomCommune(e.target.value)}
                          autoFocus
                        />
                      </div>
                    )}
                  </div>

                  {/* CTA Etape 1 */}
                  <button
                    className="w-full h-12 mt-2 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition hover:brightness-110 shadow-sm cursor-pointer"
                    style={{ background: 'var(--primary)' }}
                    type="submit"
                  >
                    <span>Continuer vers l'étape 2</span>
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                </form>

                <div className="mt-6 text-center text-xs text-slate-500">
                  <span>Déjà un compte ?</span>
                  <Link
                    className="font-bold hover:underline transition ml-1 text-[var(--primary)]"
                    to="/connexion"
                  >
                    Se connecter
                  </Link>
                </div>
              </div>
            )}

            {/* ÉTAPE 2 : Sécurisation mot de passe */}
            {step === 2 && !success && (
              <div id="step-panel-2" className="w-full flex flex-col">
                <div className="w-full mb-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} />
                    <span>Retour aux informations</span>
                  </button>
                </div>

                <div className="text-center w-full mb-6">
                  <h2 className="text-2xl font-bold tracking-tight mb-1 text-slate-900">
                    Sécurisez votre compte
                  </h2>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Définissez un mot de passe sécurisé pour vos commandes B2B.
                  </p>
                </div>

                <form id="form-step-2" onSubmit={handleStep2Submit} className="flex flex-col gap-4">
                  {/* Mot de passe */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-800" htmlFor="password">
                        Mot de passe <span className="text-[var(--primary)]">*</span>
                      </label>
                      <span id="pwd-strength-label" className={`text-[11px] font-semibold ${strength.color}`}>
                        {strength.label}
                      </span>
                    </div>

                    <PasswordInput
                      id="password"
                      placeholder="Minimum 6 caractères"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />

                    {/* Jauge 3 segments */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <div
                        id="meter-seg-1"
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          strength.level >= 1
                            ? strength.level === 1
                              ? 'bg-red-500'
                              : strength.level === 2
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                            : 'bg-slate-200'
                        }`}
                      />
                      <div
                        id="meter-seg-2"
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          strength.level >= 2
                            ? strength.level === 2
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                            : 'bg-slate-200'
                        }`}
                      />
                      <div
                        id="meter-seg-3"
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          strength.level >= 3 ? 'bg-emerald-600' : 'bg-slate-200'
                        }`}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Au moins 6 caractères (idéalement lettres, chiffres et symboles).
                    </span>
                  </div>

                  {/* Confirmation Mot de passe */}
                  <div className="flex flex-col gap-1.5 text-left">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-800" htmlFor="password_confirm">
                        Confirmer le mot de passe <span className="text-[var(--primary)]">*</span>
                      </label>
                      {confirmPassword && (
                        <span
                          id="confirm-match-status"
                          className={`text-[11px] font-semibold ${
                            password === confirmPassword ? 'text-emerald-600' : 'text-red-500'
                          }`}
                        >
                          {password === confirmPassword ? 'Identique' : 'Différent'}
                        </span>
                      )}
                    </div>

                    <PasswordInput
                      id="password_confirm"
                      placeholder="Confirmez le mot de passe"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>

                  {/* CGU Checkbox */}
                  <label className="flex items-start gap-2.5 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="terms-checkbox"
                      checked={terms}
                      onChange={(e) => setTerms(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-[#155E95]"
                      required
                    />
                    <span className="text-xs leading-relaxed text-slate-500">
                      J'accepte les conditions de vente pharmaceutique et certifie être un professionnel habilité.
                    </span>
                  </label>

                  {/* Submit Final */}
                  <button
                    id="register-submit-btn"
                    disabled={loading}
                    className="w-full h-12 mt-2 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition hover:brightness-110 shadow-sm disabled:opacity-60 cursor-pointer"
                    style={{ background: 'var(--primary)' }}
                    type="submit"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Création du compte…</span>
                      </>
                    ) : (
                      <>
                        <span>Finaliser l'inscription</span>
                        <Check className="w-4 h-4" strokeWidth={2.5} />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* SUCCÈS */}
            {success && (
              <div id="step-success" className="w-full flex flex-col items-center text-center py-6">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-emerald-50 text-emerald-600"
                >
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" strokeWidth={2.5} />
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-2 text-slate-900">
                  Compte créé avec succès !
                </h2>
                {requiresConfirmation ? (
                  <>
                    <p className="text-xs leading-relaxed max-w-sm mb-4 text-slate-600">
                      Un e-mail de confirmation a été envoyé à <strong className="text-slate-900 font-semibold">{email}</strong>.
                      Veuillez cliquer sur le lien reçu pour activer votre compte avant de vous connecter.
                    </p>
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[11px] max-w-sm mb-6 text-left">
                      💡 Pensez à vérifier vos courriers indésirables (spams) si vous ne trouvez pas l'e-mail dans votre boîte de réception.
                    </div>
                    <Link
                      to={`/connexion?email=${encodeURIComponent(email)}`}
                      className="rounded-xl px-6 py-3 text-xs font-bold text-white transition hover:brightness-110 flex items-center gap-2"
                      style={{ background: 'var(--primary)' }}
                    >
                      <span>Aller à la page de connexion</span>
                      <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-xs leading-relaxed max-w-xs mb-6 text-slate-500">
                      Bienvenue sur CYM Pharma. Vous allez être redirigé vers votre espace professionnel.
                    </p>
                    <Link
                      to="/dashboard"
                      className="rounded-xl px-6 py-3 text-xs font-bold text-white transition hover:brightness-110"
                      style={{ background: 'var(--primary)' }}
                    >
                      Accéder au dashboard
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Réassurance réglementaire */}
          <div className="mt-7 flex flex-col items-center gap-2 text-center text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" strokeWidth={2} />
              <span>Vérification d'agrément médical et conformité pharmaceutique</span>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};
