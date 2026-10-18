import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { Product } from '../../types';
import { useCart } from '../../context/CartContext';
import { ProductImageFallback } from './ProductImageFallback';

interface ProductCardProps {
  product: Product;
  isSelected?: boolean;
  onToggleSelect?: (id: string | number) => void;
  showCheckbox?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  isSelected = false,
  onToggleSelect,
  showCheckbox = false,
}) => {
  const [qty, setQty] = useState(1);
  const { add } = useCart();

  const handleMinus = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQty((prev) => Math.max(1, prev - 1));
  };

  const handlePlus = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQty((prev) => prev + 1);
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    add(
      product.id,
      product.name,
      qty,
      product.reference || product.sku,
      product.conditionnement || product.unit,
      product.unit
    );
  };

  const refCode = product.reference || product.sku || `REF-${product.id}`;

  return (
    <div className="prod-card group flex flex-col justify-between">
      <div>
        {/* Top bar with optional checkbox and packaging/category pill (No "en stock", no "CE ISO") */}
        <div className="flex items-center justify-between mb-3 min-h-[24px]">
          {showCheckbox ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect && onToggleSelect(product.id)}
              className="custom-check"
              aria-label={`Sélectionner ${product.name}`}
            />
          ) : (
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
              {refCode}
            </span>
          )}

          {product.conditionnement && (
            <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
              {product.conditionnement}
            </span>
          )}
        </div>

        {/* Visual / Icon (No photos of articles as requested) */}
        <Link
          to={`/produit?id=${product.id}`}
          className="h-32 rounded-xl flex items-center justify-center bg-slate-50 mb-3 overflow-hidden border border-slate-100 transition-all duration-200 group-hover:bg-blue-50/30 group-hover:border-blue-100"
        >
          <ProductImageFallback
            category={product.category || product.category_main}
            name={product.name}
            size={32}
          />
        </Link>

        {/* Metadata */}
        <Link
          to={`/produit?id=${product.id}`}
          className="text-xs sm:text-sm font-bold text-slate-900 mt-1 line-clamp-2 hover:text-[var(--primary)] transition-colors block leading-snug"
        >
          {product.name}
        </Link>
        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
          {product.description_short || product.description || 'Consommable ou dispositif médical pour hôpitaux et officines.'}
        </p>
      </div>

      {/* Stepper + Quick Add CTA */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <div className="qty-wrap">
          <button
            type="button"
            onClick={handleMinus}
            aria-label="Diminuer la quantité"
            className="qty-btn"
          >
            −
          </button>
          <span className="qty-display">{qty}</span>
          <button
            type="button"
            onClick={handlePlus}
            aria-label="Augmenter la quantité"
            className="qty-btn"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="btn-add flex-1"
          aria-label={`Ajouter ${product.name} au panier`}
        >
          <ShoppingCart className="w-3.5 h-3.5" strokeWidth={2} />
          <span>Ajouter</span>
        </button>
      </div>
    </div>
  );
};
