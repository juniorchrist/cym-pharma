import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, X } from 'lucide-react';
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
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { checkAdminPassword } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Veuillez saisir le mot de passe administrateur.');
      return;
    }

    setLoading(true);
    const isValid = checkAdminPassword(password);

    if (isValid) {
      setError(null);
      setPassword('');
      setLoading(false);
      onClose();
      showToast('Accès administrateur déverrouillé', 'success');

      if (onSuccess) {
        onSuccess();
        // Si onSuccess ne gère pas la navigation, rediriger quand même
        // (cas du footer où aucun onSuccess n'est passé → else branch ci-dessous)
      } else {
        // Laisser React propager les mises à jour de state (rôle élevé)
        // avant de déclencher la navigation vers /admin
        setTimeout(() => {
          navigate('/admin');
        }, 50);
      }
    } else {
      setLoading(false);
      setError('Mot de passe administrateur incorrect.');
      setPassword('');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200"
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-7 transition-all duration-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[var(--surface-alt)]">
              <Lock className="h-5 w-5 text-slate-700" strokeWidth={2} />
            </div>
            <div>
              <h3 id="admin-modal-title" className="text-base font-bold text-slate-900">
                Espace Admin
              </h3>
              <p className="text-xs text-slate-400">Accès réservé au propriétaire</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="admin-modal-pwd"
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
            >
              Mot de passe
            </label>
            <input
              id="admin-modal-pwd"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              disabled={loading}
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(21,94,149,0.12)] transition disabled:opacity-60"
            />
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
            {loading ? 'Vérification…' : "Accéder à l'administration"}
          </button>
        </form>
      </div>
    </div>
  );
};
