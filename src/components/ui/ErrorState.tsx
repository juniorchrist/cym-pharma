import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Erreur de chargement',
  message = 'Impossible de contacter le serveur. Veuillez vérifier votre connexion.',
  onRetry,
}) => {
  return (
    <div className="w-full py-14 px-6 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-red-200">
      <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 mb-4">
        <AlertCircle className="w-6 h-6" strokeWidth={1.8} />
      </div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-secondary mt-5 text-xs !py-2 !px-4 flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
          <span>Réessayer</span>
        </button>
      )}
    </div>
  );
};
