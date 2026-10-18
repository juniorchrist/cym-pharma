import React from 'react';
import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Aucun élément disponible',
  description = 'Aucune donnée ne correspond à votre sélection.',
  actionLabel,
  onAction,
  icon,
}) => {
  return (
    <div className="w-full py-16 px-6 flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-slate-200">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
        {icon || <PackageOpen className="w-6 h-6" strokeWidth={1.8} />}
      </div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-primary mt-5 text-xs !py-2 !px-4"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
