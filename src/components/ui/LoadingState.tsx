import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Chargement des données médicales en cours…',
}) => {
  return (
    <div className="w-full py-16 px-4 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-200">
      <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin mb-3" strokeWidth={2} />
      <p className="text-sm font-semibold text-slate-800">{message}</p>
      <p className="text-xs text-slate-400 mt-1">Connexion sécurisée aux stocks CYM Pharma</p>
    </div>
  );
};
