import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { X, ShoppingBag } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { storage } from '../../utils/storage';
import { CartItemRow } from './CartItemRow';

export const CartDrawer: React.FC = () => {
  const { isDrawerOpen, closeDrawer, items, count, updateQty, remove } = useCart();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (!isDrawerOpen) return null;

  const totalCount = count();

  const handleValidateOrder = () => {
    closeDrawer();
    if (!isAuthenticated) {
      storage.setRedirectAfterLogin('/commande');
      navigate('/connexion');
      return;
    }
    navigate('/commande');
  };

  return (
    <>
      {/* Overlay */}
      <div
        id="cart-overlay"
        onClick={closeDrawer}
        className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-sm opacity-100 transition-opacity duration-300"
      />

      {/* Drawer */}
      <aside
        id="cart-drawer"
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl shadow-slate-900/15 flex flex-col transform translate-x-0 transition-transform duration-300"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Mon Panier</h2>
            <p className="text-xs text-slate-400 mt-0.5">Récapitulatif de votre commande</p>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Fermer le panier"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div id="cart-items-list" className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {items.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-slate-700">Votre panier est vide</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Consultez notre catalogue pour ajouter vos consommables médicaux.
              </p>
              <div className="pt-2">
                <Link
                  to="/catalogue"
                  onClick={closeDrawer}
                  className="btn-primary text-xs inline-flex"
                >
                  Découvrir le catalogue
                </Link>
              </div>
            </div>
          ) : (
            items.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                onUpdateQty={updateQty}
                onRemove={remove}
              />
            ))
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-5 space-y-3 bg-white">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Articles en panier</span>
            <span id="cart-article-count" className="text-sm font-bold text-slate-700">
              {totalCount} article{totalCount > 1 ? 's' : ''}
            </span>
          </div>

          <button
            type="button"
            onClick={handleValidateOrder}
            disabled={items.length === 0}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Valider ma commande
          </button>

          <button
            type="button"
            onClick={closeDrawer}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
          >
            Continuer mes achats
          </button>
        </div>
      </aside>
    </>
  );
};
