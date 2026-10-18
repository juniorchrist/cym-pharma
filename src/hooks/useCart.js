import { useContext } from 'react';
import { CartContext } from '../context/CartContext';

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart doit être utilisé à l’intérieur d’un CartProvider');
  }
  return context;
}

export function formatFCFA(amount) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('fr-FR')} FCFA`;
}
