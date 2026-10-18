import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CartItem } from '../types';
import { storage } from '../utils/storage';
import { useToast } from './ToastContext';

interface CartContextType {
  items: CartItem[];
  add: (
    id: string | number,
    name: string,
    qty?: number,
    reference?: string,
    conditionnement?: string,
    unit?: string,
    image?: string
  ) => void;
  remove: (id: string | number) => void;
  updateQty: (id: string | number, delta: number) => void;
  setQty: (id: string | number, qty: number) => void;
  count: () => number;
  total: () => number;
  clear: () => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    // Sanitize any existing cached cart items in storage to remove price
    const raw = storage.getCart();
    return raw.map((it: any) => ({
      id: String(it.id),
      name: it.name,
      qty: it.qty || 1,
      reference: it.reference,
      conditionnement: it.conditionnement,
      unit: it.unit,
      image: it.image,
    }));
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    storage.setCart(items);
  }, [items]);

  const add = (
    rawId: string | number,
    name: string,
    qtyParam: number = 1,
    refOrQty?: any,
    referenceParam?: string,
    conditionnementParam?: string,
    unitParam?: string
  ) => {
    const id = String(rawId);

    // Support flexible arguments: if someone called add(id, name, price, qty, ref, cond)
    let finalQty = 1;
    let finalRef = referenceParam;
    let finalCond = conditionnementParam;
    let finalUnit = unitParam;

    if (typeof refOrQty === 'number') {
      // Legacy signature: add(id, name, price, qty, ref, cond)
      finalQty = Math.max(1, refOrQty);
      finalRef = referenceParam;
      finalCond = conditionnementParam;
    } else {
      // Modern signature: add(id, name, qty, reference, conditionnement, unit)
      finalQty = Math.max(1, qtyParam || 1);
      finalRef = typeof refOrQty === 'string' ? refOrQty : referenceParam;
      finalCond = conditionnementParam;
    }

    setItems((prev) => {
      const existing = prev.find((item) => item.id === id);
      if (existing) {
        return prev.map((item) =>
          item.id === id ? { ...item, qty: item.qty + finalQty } : item
        );
      }
      return [
        ...prev,
        {
          id,
          name,
          qty: finalQty,
          reference: finalRef,
          conditionnement: finalCond,
          unit: finalUnit,
        },
      ];
    });

    showToast(`"${name}" ajouté au bon de commande (${finalQty})`, 'success');
  };

  const remove = (rawId: string | number) => {
    const id = String(rawId);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQty = (rawId: string | number, delta: number) => {
    const id = String(rawId);
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const next = item.qty + delta;
          return { ...item, qty: Math.max(1, next) };
        }
        return item;
      })
    );
  };

  const setQty = (rawId: string | number, qty: number) => {
    const id = String(rawId);
    const validQty = Math.max(1, qty);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: validQty } : item))
    );
  };

  const count = () => {
    return items.reduce((acc, it) => acc + (it.qty || 0), 0);
  };

  const total = () => {
    return 0; // Prices are strictly private to admin
  };

  const clear = () => {
    setItems([]);
  };

  const openDrawer = () => setIsDrawerOpen(true);
  const closeDrawer = () => setIsDrawerOpen(false);

  return (
    <CartContext.Provider
      value={{
        items,
        add,
        remove,
        updateQty,
        setQty,
        count,
        total,
        clear,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
