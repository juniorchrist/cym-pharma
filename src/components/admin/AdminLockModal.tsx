import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, X, Mail, KeyRound, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface AdminLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AdminLockModal: React.FC<AdminLockModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, isAdmin, checkAdminPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleDirectAccess = () => {
    onClose();
    if (onSuccess) {
      onSuccess();
    } else {
      navigate('/admin');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetEmail = user?.role === 'admin' ? (user.email || email) : email;

    if (!targetEmail || !password) {
      setError('Veuillez renseigner votre email et mot de passe administrateur.');
      return;
    }

    setLoading(true);
    try {
      const isValid = await checkAdminPassword(targetEmail, password);

      if (isValid) {
        setError(null);
        setPassword('');
        setEmail('');
        setLoading(false);
        onClose();
        showToast('Accès administrateur authentifié avec succès', 'success');

        if (onSuccess) {
          onSuccess();
        } else {
          // Délai suffisant pour que onAuthStateChange mette à jour le state
          // avant que AdminRoute vérifie les droits.
          setTimeout(() => {
            navigate('/admin');
          }, 600);
        }
      } else {
        setLoading(false);
        setError('Identifiants administrateur incorrects ou privilèges insuffisants.');
        setPassword('');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Erreur lors de la validation des droits administrateur.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-200"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-7 transition-all duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[var(--surface-alt)]">
              <Lock className="h-5 w-5 text-slate-700" strokeWidth={2} />
            </div>
            <div>
              <h3 id="admin-modal-title" className="text-base font-bold text-slate-900">
                Espace Direction & Gestion
              </h3>
              <p className="text-xs text-slate-400">Authentification sécurisée CYM Pharma</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la modale"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {isAdmin ? (
          <div className="space-y-4">
            <div className="rounded-xl p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <p className="font-semibold">Session administrateur active</p>
              <p className="mt-0.5 text-emerald-700 font-mono text-[11px] truncate">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleDirectAccess}
              className="btn-primary w-full py-3"
            >
              Accéder au tableau d'administration
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {user && user.role !== 'admin' && (
              <div className="flex items-start gap-2 rounded-xl p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs mb-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <span>Connecté en tant que client. Saisissez les identifiants administrateur.</span>
              </div>
            )}

            <div>
              <label
                htmlFor="admin-modal-email"
                className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Email administrateur
              </label>
              <div className="relative">
                <input
                  id="admin-modal-email"
                  type="email"
                  placeholder="direction@cympharma.ci"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  disabled={loading}
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,149,0.12)] transition disabled:opacity-60"
                />
                <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-modal-pwd"
                className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
              >
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="admin-modal-pwd"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,149,0.12)] transition disabled:opacity-60"
                />
                <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl p-3 text-xs font-semibold text-center bg-red-50 text-red-600 border border-red-200"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-60"
            >
              {loading ? 'Authentification…' : "Connexion Administrateur"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
