import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useScrollDirection } from './useScrollDirection';

/**
 * Hook déterminant si la barre de navigation basse doit être masquée :
 * - Selon la route (masquée sur connexion, inscription, commande, admin, bon de livraison, facture, produit)
 * - Selon le défilement (masquée au scroll vers le bas, réapparaît vers le haut)
 * - Selon le clavier virtuel (masquée si focus sur un champ de saisie)
 */
export function useBottomNavHidden(): boolean {
  const { pathname } = useLocation();
  const scrollDirection = useScrollDirection(8);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Détection du clavier virtuel mobile via focus/blur sur les champs de saisie
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // 1. Vérification des routes exclues
  const isExcludedRoute = (() => {
    const p = pathname.toLowerCase();
    // Masquée sur Connexion, Inscription, Commande (checkout), Admin, Bon de livraison, Facture, Produit
    if (
      p.startsWith('/connexion') ||
      p.startsWith('/inscription') ||
      p.startsWith('/commande') ||
      p.startsWith('/admin') ||
      p.startsWith('/bon-livraison') ||
      p.startsWith('/facture') ||
      p.startsWith('/produit')
    ) {
      return true;
    }
    return false;
  })();

  if (isExcludedRoute) {
    return true;
  }

  // 2. Masquage si clavier virtuel ouvert
  if (isKeyboardOpen) {
    return true;
  }

  // 3. Masquage selon la direction du défilement
  return scrollDirection === 'down';
}
