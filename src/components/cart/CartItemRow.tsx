import React from 'react';
import { CartItem } from '../../types';

interface CartItemRowProps {
  item: CartItem;
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}

export const CartItemRow: React.FC<CartItemRowProps> = ({ item, onUpdateQty, onRemove }) => {
  return (
    <div className="p-3.5 rounded-xl border border-slate-100 flex items-center justify-between gap-3 bg-slate-50">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
          {item.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => onUpdateQty(item.id, -1)}
            aria-label="Diminuer la quantité"
            className="w-6 h-6 rounded-md bg-white border border-slate-200 text-xs font-bold hover:bg-slate-100 cursor-pointer"
          >
            −
          </button>
          <span className="text-xs font-bold px-1 text-slate-800">{item.qty}</span>
          <button
            type="button"
            onClick={() => onUpdateQty(item.id, 1)}
            aria-label="Augmenter la quantité"
            className="w-6 h-6 rounded-md bg-white border border-slate-200 text-xs font-bold hover:bg-slate-100 cursor-pointer"
          >
            +
          </button>
          {item.reference && (
            <span className="text-[10px] font-mono text-slate-400">
              Réf. {item.reference}
            </span>
          )}
          {(item.conditionnement || item.unit) && (
            <span className="text-[10px] text-slate-500 font-medium bg-slate-200/60 px-1.5 py-0.5 rounded">
              {item.conditionnement || item.unit}
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="text-[11px] text-red-500 hover:underline cursor-pointer"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
};
